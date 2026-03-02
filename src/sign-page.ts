export type SignPageInitResult<TPayload = unknown, TResult = unknown> = {
  payload: TPayload | null;
  sign: (result?: TResult) => Promise<void>;
};

export const initPrivySignPage = <TPayload = unknown, TResult = unknown>(): SignPageInitResult<TPayload, TResult> => {
  return {
    payload: null,
    sign: async () => {
      throw new Error("initPrivySignPage is not implemented yet.");
    }
  };
};
