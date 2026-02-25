import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { createHashlineEditTool } from "./tools/hashline-edit"
import { createHashlineReadEnhancerHook } from "./hooks/hashline-read-enhancer"
import { consumeToolMetadata } from "./features/tool-metadata-store"

export { createHashlineEditTool } from "./tools/hashline-edit"
export { createHashlineReadEnhancerHook } from "./hooks/hashline-read-enhancer"

export const HashlinePlugin: Plugin = async (ctx: PluginInput) => {
  const readEnhancer = createHashlineReadEnhancerHook(ctx)

  return {
    tool: {
      edit: createHashlineEditTool(),
    },
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: Record<string, unknown> } | undefined
    ) => {
      // Restore metadata that OpenCode's fromPlugin() may have overwritten
      if (output) {
        const stored = consumeToolMetadata(input.sessionID, input.callID)
        if (stored) {
          if (stored.title) output.title = stored.title
          if (stored.metadata) output.metadata = { ...output.metadata, ...stored.metadata }
        }
      }
      // Apply read enhancer (adds LINE#ID hashes to read output)
      if (output) {
        await readEnhancer["tool.execute.after"](input, output)
      }
    },
    "experimental.chat.messages.transform": readEnhancer["experimental.chat.messages.transform"],
  }
}

export default HashlinePlugin
