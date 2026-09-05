# Portfolio publication contract

Read this before drafting, editing, committing or publishing portfolio material.
This applies to human-written copy and model-written copy equally.

## Mandatory privacy and common-sense pass

Evidence that something happened is not permission to publish it. Access to
Stream, project notes, correspondence or a private document does not make that
material public.

Before publication, read the complete changed page and ask:

- Does this quote, paraphrase or expose a private conversation, email, message,
  reference, interview, family interaction or workplace exchange?
- Could the person or organisation be identified from a role, event, date or
  surrounding story even if their name is removed?
- Would this reasonably surprise, embarrass, misrepresent or harm somebody,
  imply an endorsement, or damage a personal or professional relationship?
- Is the detail necessary to explain the work, or is private context being used
  for colour, authority or a dramatic ending?
- Is there confidential employer, collaborator, customer or research material,
  personal contact information, credentials or other sensitive data?

Do not publish private third-party remarks without explicit permission for that
specific disclosure. A general instruction to write or publish a page is not
that permission. Do not assume consent because Seán wrote the draft himself.

Prefer Seán's own supported experience, reasoning and engineering conclusions.
Generalise or omit unnecessary people, organisations, dates and correspondence
details. Removing a name alone is not adequate anonymisation. Do not turn another
person's remark into Seán's belief merely by removing the attribution.

Preserve appropriate project credit, authorship and sourced public statements.
Names and ordinary acknowledgements are not automatically a privacy problem.
Public-source status and permission must be considered separately from whether
the story is flattering or critical.

When a consequential disclosure remains ambiguous, show Seán the exact passage
and proposed generalisation before publishing it. Flag findings in unchanged
pages separately; do not silently rewrite unrelated personal accounts.

## Check the whole publication surface

Review prose, captions, alt text, HTML comments and attributes, filenames, link
targets, downloadable documents, embedded reports and media. Screenshots, video
frames and audio can expose private material that a text search will miss.
Review relevant media directly; never claim it was cleared from filenames alone.
Do not ship private source notes or local media-selection instructions in HTML.

Search is a locator, not the complete judgment pass. Read passages in context.
Use the same check for new pages, revisions, historical summaries and material
retrieved from memory. Keep private source evidence out of public documentation,
commit messages, tests and review fixtures too.

## Release and incident handling

- Inspect the complete diff. Preserve unrelated work and stage only intended files.
- Run proportionate checks and perform the privacy pass before a commit or push.
- Verify the deployed page actually contains the intended copy. A successful
  push alone does not establish that the live site has updated.
- For urgent redaction, publish the safe correction first, then finish the wider
  audit. Do not delay removal for optional stylistic improvements.
- A normal edit does not erase Git history. Rewrite history only with explicit
  authorisation, inspect affected refs, isolate unrelated work and use an exact
  force-with-lease. Verify retained content and report any remaining exposure.
- State audit limits honestly, especially unreviewed media, external documents,
  historical URLs and hosting-provider retention. Never promise total erasure
  when only current pages or reachable Git history were checked.

The final handoff should identify what changed, what was verified and any
remaining publication concern. Keep it concise; do not repeat removed material.
