"use client";

type Props = {
  message: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Submit button that asks for confirmation before allowing the form
 * to submit. Use inside a server-action <form>. If the user cancels
 * the confirm dialog, the submit is blocked.
 */
export function ConfirmButton({ message, className, children }: Props) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
