export type PrivyNearExecutorOptions = {
  manifestUrl?: string;
};

export type PrivyNearExecutor = {
  options: PrivyNearExecutorOptions;
};

export const createPrivyNearExecutor = (
  options: PrivyNearExecutorOptions = {}
): PrivyNearExecutor => {
  return {
    options
  };
};
