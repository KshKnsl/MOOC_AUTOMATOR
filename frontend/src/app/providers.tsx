"use client";

import Link from "next/link";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="dark">
      <LinkProvider component={Link}>
        <ToastViewport position="bottomEnd" maxVisible={3}>
          {children}
        </ToastViewport>
      </LinkProvider>
    </Theme>
  );
}
