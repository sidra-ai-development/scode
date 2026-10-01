export const CLI_COMMAND_NAME = "scode";
export const CLI_PROCESS_NAME = "scode-cli";
export const setCliProcessTitle = (target = process) => {
    target.title = CLI_PROCESS_NAME;
};
