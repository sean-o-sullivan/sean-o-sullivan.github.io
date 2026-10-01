const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../static/js/nav-loader.js'), 'utf8');
const homepage = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function setup(pathname) {
    const appended = [];
    const context = vm.createContext({
        window: { location: { pathname } },
        document: {
            addEventListener() {},
            createElement() {
                const events = {};
                return { events, addEventListener(name, listener) { events[name] = listener; } };
            },
            head: { append(element) { appended.push(element); } }
        }
    });
    vm.runInContext(script, context);
    return { appended, load: () => vm.runInContext('loadProjectWake()', context) };
}

for (const pathname of ['/projects/mu/', '/projects/ogma/', '/tooling/twister/']) {
    test(`loads the identical homepage wake in order on ${pathname}`, async () => {
        const { appended, load } = setup(pathname);
        const finished = load();
        assert.equal(appended.length, 1);
        assert.equal(appended[0].rel, 'stylesheet');
        assert.equal(appended[0].href, '/static/cursor-wake.css?v=1');
        assert.ok(homepage.includes(`href="${appended[0].href}"`));
        appended[0].events.load();
        await Promise.resolve();
        assert.equal(appended.length, 2);
        assert.equal(appended[1].src, '/static/js/fluid-field.js?v=1');
        appended[1].events.load();
        await Promise.resolve();
        assert.equal(appended.length, 3);
        assert.equal(appended[2].src, '/static/js/cursor-ripple.js?v=5');
        for (const element of appended.slice(1)) assert.ok(homepage.includes(`src="${element.src}"`));
        appended[2].events.load();
        await finished;
    });
}

test('does not duplicate the homepage wake or load on unrelated pages', async () => {
    for (const pathname of ['/', '/index.html', '/404.html', '/projects-other/']) {
        const { appended, load } = setup(pathname);
        await load();
        assert.equal(appended.length, 0);
    }
});

test('a failed solver load does not start the renderer', async () => {
    const { appended, load } = setup('/projects/mu/');
    const finished = load();
    appended[0].events.load();
    await Promise.resolve();
    const failure = new Error('Offline');
    appended[1].events.error(failure);
    await assert.rejects(finished, failure);
    assert.equal(appended.length, 2);
});

test('a failed stylesheet does not start an unstyled overlay', async () => {
    const { appended, load } = setup('/projects/mu/');
    const finished = load();
    const failure = new Error('Offline');
    appended[0].events.error(failure);
    await assert.rejects(finished, failure);
    assert.equal(appended.length, 1);
});
