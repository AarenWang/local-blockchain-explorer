const prefix = '[indexer]';

export const logInfo = (message: string) => {
  console.log(prefix, message);
};

export const logWarn = (message: string) => {
  console.warn(prefix, message);
};

export const logError = (message: string) => {
  console.error(prefix, message);
};
