export const TUI_TITLE_GENERATION_CONFIG = {};
export const createCliModeState = (mode) => {
    const effectiveMode = mode ?? "yolo";
    return {
        current: effectiveMode,
        override: effectiveMode,
    };
};
export const currentCliMode = (state) => state.current ?? state.override ?? "yolo";
/** The TUI's Plan entry projects the runtime's independent planning flag. */
export function readTuiMode(app, fallback) {
    return app.runtime?.getPlanEnabled?.() ? "plan" : (app.getMode?.() ?? fallback);
}
