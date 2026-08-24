import { createContext } from "react";

export const PaletteOpenContext = createContext<(open: boolean) => void>(() => {});
