import { Popover } from "./Popover";
import { TermPopoverBody } from "./TermPopoverBody";
import { getTerm } from "@/data/termDictionary";

interface HelpHintProps {
  termKey: string;
  ariaLabel?: string;
  className?: string;
}

export function HelpHint({ termKey, ariaLabel, className = "" }: HelpHintProps) {
  const term = getTerm(termKey);
  if (!term) return null;

  return (
    <Popover
      ariaLabel={ariaLabel ?? `Definition: ${term.label}`}
      trigger={
        <button
          type="button"
          aria-label={ariaLabel ?? `What is ${term.label}?`}
          className={`ml-1 inline-flex h-4 w-4 items-center justify-center border border-text-muted/60 text-[10px] font-mono text-text-muted transition-colors hover:border-accent hover:text-accent focus:outline-none focus:border-accent focus:text-accent ${className}`}
        >
          ?
        </button>
      }
    >
      <TermPopoverBody term={term} />
    </Popover>
  );
}
