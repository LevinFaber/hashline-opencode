/// <reference types="bun-types" />

import { describe, it, expect } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { createHashlineReadEnhancerHook } from "./hook"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

function mockCtx(): PluginInput {
  return {
    client: {} as PluginInput["client"],
    directory: "/test",
    project: "/test" as unknown as PluginInput["project"],
    worktree: "/test",
    serverUrl: "http://localhost" as unknown as PluginInput["serverUrl"],
    $: {} as PluginInput["$"],
  }
}

describe("hashline-read-enhancer", () => {
  it("hashifies only file content lines in read output", async () => {
    //#given
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const input = { tool: "read", sessionID: "s", callID: "c" }
    const output = {
      title: "demo.ts",
      output: [
        "<path>/tmp/demo.ts</path>",
        "<type>file</type>",
        "<content>",
        "1: const x = 1",
        "2: const y = 2",
        "",
        "(End of file - total 2 lines)",
        "</content>",
        "",
        "<system-reminder>",
        "1: keep this unchanged",
        "</system-reminder>",
      ].join("\n"),
      metadata: {},
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then
    const lines = output.output.split("\n")
    expect(lines[3]).toMatch(/^1#[ZPMQVRWSNKTXJBYH]{2}\|const x = 1$/)
    expect(lines[4]).toMatch(/^2#[ZPMQVRWSNKTXJBYH]{2}\|const y = 2$/)
    expect(lines[10]).toBe("1: keep this unchanged")
  })

  it("hashifies inline <content> format from updated OpenCode read tool", async () => {
    //#given
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const input = { tool: "read", sessionID: "s", callID: "c" }
    const output = {
      title: "demo.ts",
      output: [
        "<path>/tmp/demo.ts</path>",
        "<type>file</type>",
        "<content>1: const x = 1",
        "2: const y = 2",
        "",
        "(End of file - total 2 lines)",
        "</content>",
      ].join("\n"),
      metadata: {},
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then
    const lines = output.output.split("\n")
    expect(lines[0]).toBe("<path>/tmp/demo.ts</path>")
    expect(lines[1]).toBe("<type>file</type>")
    expect(lines[2]).toBe("<content>")
    expect(lines[3]).toMatch(/^1#[ZPMQVRWSNKTXJBYH]{2}\|const x = 1$/)
    expect(lines[4]).toMatch(/^2#[ZPMQVRWSNKTXJBYH]{2}\|const y = 2$/)
    expect(lines[6]).toBe("(End of file - total 2 lines)")
    expect(lines[7]).toBe("</content>")
  })

  it("keeps OpenCode-truncated lines unhashed while hashifying normal lines", async () => {
    //#given
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const input = { tool: "read", sessionID: "s", callID: "c" }
    const truncatedLine = `${"x".repeat(60)}... (line truncated to 2000 chars)`
    const output = {
      title: "demo.ts",
      output: [
        "<path>/tmp/demo.ts</path>",
        "<type>file</type>",
        "<content>",
        `1: ${truncatedLine}`,
        "2: normal line",
        "</content>",
      ].join("\n"),
      metadata: {},
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then
    const lines = output.output.split("\n")
    expect(lines[3]).toBe(`1: ${truncatedLine}`)
    expect(lines[4]).toMatch(/^2#[ZPMQVRWSNKTXJBYH]{2}\|normal line$/)
  })

  it("hashifies plain read output without content tags", async () => {
    //#given
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const input = { tool: "read", sessionID: "s", callID: "c" }
    const output = {
      title: "README.md",
      output: [
        "1: # Oh-My-OpenCode Features",
        "2:",
        "3: Hashline test",
        "",
        "(End of file - total 3 lines)",
      ].join("\n"),
      metadata: {},
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then
    const lines = output.output.split("\n")
    expect(lines[0]).toMatch(/^1#[ZPMQVRWSNKTXJBYH]{2}\|# Oh-My-OpenCode Features$/)
    expect(lines[1]).toMatch(/^2#[ZPMQVRWSNKTXJBYH]{2}\|$/)
    expect(lines[2]).toMatch(/^3#[ZPMQVRWSNKTXJBYH]{2}\|Hashline test$/)
    expect(lines[4]).toBe("(End of file - total 3 lines)")
  })

  it("hashifies read output with <file> and zero-padded pipe format", async () => {
    //#given
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const input = { tool: "read", sessionID: "s", callID: "c" }
    const output = {
      title: "demo.ts",
      output: [
        "<file>",
        "00001| const x = 1",
        "00002| const y = 2",
        "",
        "(End of file - total 2 lines)",
        "</file>",
      ].join("\n"),
      metadata: {},
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then
    const lines = output.output.split("\n")
    expect(lines[1]).toMatch(/^1#[ZPMQVRWSNKTXJBYH]{2}\|const x = 1$/)
    expect(lines[2]).toMatch(/^2#[ZPMQVRWSNKTXJBYH]{2}\|const y = 2$/)
    expect(lines[5]).toBe("</file>")
  })

  it("hashifies pipe format even with leading spaces", async () => {
    //#given
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const input = { tool: "read", sessionID: "s", callID: "c" }
    const output = {
      title: "demo.ts",
      output: [
        "<file>",
        "   00001| const x = 1",
        "   00002| const y = 2",
        "",
        "(End of file - total 2 lines)",
        "</file>",
      ].join("\n"),
      metadata: {},
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then
    const lines = output.output.split("\n")
    expect(lines[1]).toMatch(/^1#[ZPMQVRWSNKTXJBYH]{2}\|const x = 1$/)
    expect(lines[2]).toMatch(/^2#[ZPMQVRWSNKTXJBYH]{2}\|const y = 2$/)
  })

  it("appends simple summary for write tool instead of full hashlined content", async () => {
    //#given
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hashline-write-"))
    const filePath = path.join(tempDir, "demo.ts")
    fs.writeFileSync(filePath, "const x = 1\nconst y = 2")
    const input = { tool: "write", sessionID: "s", callID: "c" }
    const output = {
      title: "write",
      output: "Wrote file successfully.",
      metadata: { filepath: filePath },
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then
    expect(output.output).toContain("File written successfully.")
    expect(output.output).toContain("2 lines written.")
    expect(output.output).not.toContain("Updated file (LINE#ID|content):")
    expect(output.output).not.toContain("const x = 1")

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it("does not re-process write output that already contains the success marker", async () => {
    //#given
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hashline-idem-"))
    const filePath = path.join(tempDir, "demo.ts")
    fs.writeFileSync(filePath, "a\nb\nc\nd\ne")
    const input = { tool: "write", sessionID: "s", callID: "c" }
    const output = {
      title: "write",
      output: "File written successfully. 99 lines written.",
      metadata: { filepath: filePath },
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then — guard should prevent re-reading the file and updating the count
    expect(output.output).toBe("File written successfully. 99 lines written.")

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it("does not overwrite write tool error output with success message", async () => {
    //#given — write tool failed, but stale file exists from previous write
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hashline-err-"))
    const filePath = path.join(tempDir, "demo.ts")
    fs.writeFileSync(filePath, "const x = 1")
    const input = { tool: "write", sessionID: "s", callID: "c" }
    const output = {
      title: "write",
      output: "Error: EACCES: permission denied, open '" + filePath + "'",
      metadata: { filepath: filePath },
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then — error output must be preserved, not overwritten with success message
    expect(output.output).toContain("Error: EACCES")
    expect(output.output).not.toContain("File written successfully.")

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it("always hashifies read output (feature is always enabled)", async () => {
    //#given — the standalone plugin has no disable toggle; it always processes
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const input = { tool: "read", sessionID: "s", callID: "c" }
    const output = {
      title: "demo.ts",
      output: "<content>\n1: const x = 1\n</content>",
      metadata: {},
    }

    //#when
    await hook["tool.execute.after"](input, output)

    //#then — always hashified, no config toggle can disable it
    expect(output.output).toMatch(/1#[ZPMQVRWSNKTXJBYH]{2}\|const x = 1/)
  })

  it("does not crash when called with no config argument — regression for TypeError: undefined is not an object (evaluating 'config2.hashline_edit')", async () => {
    //#given — createHashlineReadEnhancerHook takes only ctx, no config
    //         this test documents the original bug and proves the fix holds
    const hook = createHashlineReadEnhancerHook(mockCtx())
    const input = { tool: "read", sessionID: "s", callID: "c" }
    const output = {
      title: "demo.ts",
      output: "<content>\n1: const x = 1\n</content>",
      metadata: {},
    }

    //#when + then — must not throw, and must hashify
    await expect(hook["tool.execute.after"](input, output)).resolves.toBeUndefined()
    expect(output.output).toMatch(/1#[ZPMQVRWSNKTXJBYH]{2}\|const x = 1/)
  })

  describe("experimental.chat.messages.transform", () => {
    //#given — test data builders
    function createFilePart(overrides: Record<string, any> = {}) {
      return {
        id: "fp1",
        sessionID: "s",
        messageID: "m",
        type: "file",
        mime: "text/plain",
        url: "data:text/plain;base64,dGVzdA==",
        source: {
          type: "file",
          path: "/path/to/file.ts",
          text: { value: "line one\nline two\nline three", start: 0, end: 47 },
        },
        ...overrides,
      }
    }

    function createMessage(overrides: Record<string, any> = {}) {
      return {
        id: "m1",
        role: "user",
        sessionID: "s",
        ...overrides,
      } as any
    }

    it("Case 1: text file FilePart gets a synthetic LineID text part injected before it", async () => {
      //#given
      const hook = createHashlineReadEnhancerHook(mockCtx())
      const filePart = createFilePart({
        source: {
          type: "file",
          path: "/path/to/file.ts",
          text: { value: "const x = 1\nconst y = 2", start: 0, end: 25 },
        },
      })
      const message = createMessage()
      const input = {}
      const output = {
        messages: [
          {
            info: message,
            parts: [filePart],
          },
        ],
      }

      //#when
      const transform = hook["experimental.chat.messages.transform"]
      expect(transform).toBeDefined()
      await transform(input, output)

      //#then
      expect(output.messages[0].parts.length).toBe(2)
      const syntheticPart = output.messages[0].parts[0]
      const filePart2 = output.messages[0].parts[1]
      expect(syntheticPart.type).toBe("text")
      expect(syntheticPart.synthetic).toBe(true)
      expect(syntheticPart.text).toMatch(/1#[ZPMQVRWSNKTXJBYH]{2}\|const x = 1/)
      expect(syntheticPart.text).toMatch(/2#[ZPMQVRWSNKTXJBYH]{2}\|const y = 2/)
      expect(filePart2).toEqual(filePart)
    })

    it("Case 2: FilePart with binary mime type is skipped", async () => {
      //#given
      const hook = createHashlineReadEnhancerHook(mockCtx())
      const filePart = createFilePart({ mime: "image/png" })
      const message = createMessage()
      const input = {}
      const output = {
        messages: [
          {
            info: message,
            parts: [filePart],
          },
        ],
      }
      const originalLength = output.messages[0].parts.length

      //#when
      const transform = hook["experimental.chat.messages.transform"]
      await transform(input, output)

      //#then — no injection for binary mime
      expect(output.messages[0].parts.length).toBe(originalLength)
      expect(output.messages[0].parts[0]).toEqual(filePart)
    })

    it("Case 3: FilePart without source is skipped", async () => {
      //#given
      const hook = createHashlineReadEnhancerHook(mockCtx())
      const filePart = createFilePart({ source: undefined })
      const message = createMessage()
      const input = {}
      const output = {
        messages: [
          {
            info: message,
            parts: [filePart],
          },
        ],
      }
      const originalLength = output.messages[0].parts.length

      //#when
      const transform = hook["experimental.chat.messages.transform"]
      await transform(input, output)

      //#then — no injection for missing source
      expect(output.messages[0].parts.length).toBe(originalLength)
      expect(output.messages[0].parts[0]).toEqual(filePart)
    })

    it("Case 4: multiple FileParts — each text one gets its own synthetic part", async () => {
      //#given
      const hook = createHashlineReadEnhancerHook(mockCtx())
      const filePart1 = createFilePart({
        id: "fp1",
        source: {
          type: "file",
          path: "/path/to/file1.ts",
          text: { value: "const a = 1", start: 0, end: 11 },
        },
      })
      const filePart2 = createFilePart({
        id: "fp2",
        source: {
          type: "file",
          path: "/path/to/file2.ts",
          text: { value: "const b = 2", start: 0, end: 11 },
        },
      })
      const message = createMessage()
      const input = {}
      const output = {
        messages: [
          {
            info: message,
            parts: [filePart1, filePart2],
          },
        ],
      }

      //#when
      const transform = hook["experimental.chat.messages.transform"]
      await transform(input, output)

      //#then — two synthetic parts, one per FilePart
      expect(output.messages[0].parts.length).toBe(4)
      expect(output.messages[0].parts[0].type).toBe("text")
      expect(output.messages[0].parts[0].synthetic).toBe(true)
      expect(output.messages[0].parts[1]).toEqual(filePart1)
      expect(output.messages[0].parts[2].type).toBe("text")
      expect(output.messages[0].parts[2].synthetic).toBe(true)
      expect(output.messages[0].parts[3]).toEqual(filePart2)
    })

    it("Case 5: only the LAST user message is processed", async () => {
      //#given
      const hook = createHashlineReadEnhancerHook(mockCtx())
      const userFilePart = createFilePart({ id: "fp-user" })
      const assistantFilePart = createFilePart({ id: "fp-assistant" })
      const userMessage = createMessage()
      const assistantMessage = createMessage({ id: "m2", role: "assistant" })
      const input = {}
      const output = {
        messages: [
          {
            info: userMessage,
            parts: [userFilePart],
          },
          {
            info: assistantMessage,
            parts: [assistantFilePart],
          },
        ],
      }

      //#when
      const transform = hook["experimental.chat.messages.transform"]
      await transform(input, output)

      //#then — only last user message (not last message) is processed
      expect(output.messages[0].parts.length).toBe(2)
      expect(output.messages[0].parts[0].type).toBe("text")
      expect(output.messages[1].parts.length).toBe(1)
      expect(output.messages[1].parts[0]).toEqual(assistantFilePart)
    })

    it("Case 6: SymbolSource (type: 'symbol') also gets LINE#ID annotation", async () => {
      //#given
      const hook = createHashlineReadEnhancerHook(mockCtx())
      const filePart = createFilePart({
        source: {
          type: "symbol",
          path: "/path/to/file.ts",
          name: "foo",
          text: { value: "function foo() {\n  return 1\n}", start: 0, end: 30 },
          range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
        },
      })
      const message = createMessage()
      const input = {}
      const output = {
        messages: [
          {
            info: message,
            parts: [filePart],
          },
        ],
      }

      //#when
      const transform = hook["experimental.chat.messages.transform"]
      await transform(input, output)

      //#then
      expect(output.messages[0].parts.length).toBe(2)
      const syntheticPart = output.messages[0].parts[0]
      expect(syntheticPart.type).toBe("text")
      expect(syntheticPart.synthetic).toBe(true)
      expect(syntheticPart.text).toMatch(/1#[ZPMQVRWSNKTXJBYH]{2}\|function foo/)
    })

    it("Case 7: empty source.text.value → no injection", async () => {
      //#given
      const hook = createHashlineReadEnhancerHook(mockCtx())
      const filePart = createFilePart({
        source: {
          type: "file",
          path: "/path/to/empty.ts",
          text: { value: "", start: 0, end: 0 },
        },
      })
      const message = createMessage()
      const input = {}
      const output = {
        messages: [
          {
            info: message,
            parts: [filePart],
          },
        ],
      }
      const originalLength = output.messages[0].parts.length

      //#when
      const transform = hook["experimental.chat.messages.transform"]
      await transform(input, output)

      //#then — no injection for empty source
      expect(output.messages[0].parts.length).toBe(originalLength)
      expect(output.messages[0].parts[0]).toEqual(filePart)
    })
  })
})
