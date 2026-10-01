export type SlashCommand =
  | {
      args: string;
      name:
        | "compact"
        | "context"
        | "effort"
        | "fork"
        | "help"
        | "init"
        | "locale"
        | "mcp"
        | "mode"
        | "model"
        | "new"
        | "resume"
        | "rewind"
        | "theme";
      rawName: string;
      type: "known";
    }
  | {
      args: string;
      rawName: string;
      type: "unknown";
    };
