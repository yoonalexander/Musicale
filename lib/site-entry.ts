"use client";

import { createContext, useContext } from "react";

export const SiteEntryContext = createContext(false);
export const useSiteEntry = () => useContext(SiteEntryContext);
