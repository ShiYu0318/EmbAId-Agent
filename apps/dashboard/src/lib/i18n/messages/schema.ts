import type { Messages } from "./zh-TW";

export type LocaleMessages = {
  [K in keyof Messages]: {
    [P in keyof Messages[K]]: string;
  };
};
