/**
 * Wrap a sensitive value (equity, market value, etc.) so the
 * <PrivacyToggle /> in the nav can blur it when the user wants to
 * screen-share without revealing finances.
 *
 * No client-side JS required — the wrapper just emits a span with
 * className="sensitive". The CSS rule in globals.css does the blurring
 * when html[data-privacy="hidden"] is set.
 *
 * Usage:
 *   <Sensitive>{money(netWorth)}</Sensitive>
 *   <Sensitive as="div" className="text-xl">{money(equity)}</Sensitive>
 */
import type { ReactNode, ElementType, HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  /** HTML tag to render. Defaults to span. */
  as?: ElementType;
};

export function Sensitive({ as: Tag = "span", className = "", children, ...rest }: Props) {
  const cls = `sensitive ${className}`.trim();
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
