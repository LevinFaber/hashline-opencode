# hashline-opencode

OpenCode plugin that replaces the built-in `edit` tool with hash-anchored LINE#ID precision editing.

## What is LINE#ID?

LINE#ID is a content-addressed line reference format. Each line gets tagged with a hash derived from its content.

```
{line_number}#{hash_id}|content
```

- `hash_id`: Two characters from the CID set `ZPMQVRWSNKTXJBYH`
- Computed using xxHash32 via Bun's built-in `Bun.hash.xxHash32`
- Example: `42#VK` means line 42 with hash `VK`

This prevents editing the wrong line. If a file changes after you read it, the hash won't match and the edit is rejected before any corruption happens.

## Installation

### Option 1: npm

```bash
npm install hashline-opencode
```

Then add to your `opencode.json`:

```json
{
  "plugins": ["hashline-opencode"]
}
```

### Option 2: Local plugin directory

Place the plugin in `.opencode/plugins/hashline-opencode/` and reference it:

```json
{
  "plugins": ["./.opencode/plugins/hashline-opencode"]
}
```

### Option 3: Global plugin (symlink)

Symlink the built `dist/index.js` directly into the global plugin directory:

```bash
mkdir -p ~/.config/opencode/plugins
ln -s /path/to/hashline-opencode/dist/index.js ~/.config/opencode/plugins/hashline-opencode.js
```

The file must live directly in `~/.config/opencode/plugins/` — symlinks to directories won't work.

## What it does

- Replaces built-in `edit` tool with `hashline_edit` using LINE#ID hash anchors
- Hooks into `tool.execute.after` to add LINE#IDs to all `read` tool output
- **Annotates `@`-mentioned files with LINE#IDs** — unlike other implementations, this plugin intercepts OpenCode's `experimental.chat.messages.transform` hook to process files included via `@filename`, so the AI receives correct hashes immediately without a separate read step
- Validates hashes before applying edits — rejects stale references
- Supports three operations: `replace`, `append`, `prepend`
- Applies edits bottom-up to preserve line numbers during multi-edit
- Auto-corrects: restores indentation, preserves BOM/CRLF, expands merged lines

## LINE#ID Format

When the plugin is active, `read` output looks like this:

```
1#XN|import type { Plugin } from "@opencode-ai/plugin"
2#WW|import { createHashlineEditTool } from "./tools/hashline-edit"
3#TY|import { createHashlineReadEnhancerHook } from "./hooks/hashline-read-enhancer"
```

To edit line 2, reference its full LINE#ID:

```json
{
  "filePath": "src/index.ts",
  "edits": [
    {
      "op": "replace",
      "pos": "2#WW",
      "lines": "import { createHashlineEditTool, applyHashlineEdits } from \"./tools/hashline-edit\""
    }
  ]
}
```

Rules:

- Use `{line_number}#{hash_id}` only — never include the `|content` part
- Copy tags exactly from read output
- Always anchor to structural lines (functions, classes, braces), never blank lines
- Batch all edits for one file in a single call
- Re-read the file before making another edit call

## Requirements

- Bun runtime (uses `Bun.hash.xxHash32`)

## License

SUL-1.0
