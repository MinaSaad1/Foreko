import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from"react";

type Placement ="bottom" |"top" |"right" |"left";

interface PopoverProps {
  trigger: ReactElement<{
    onClick?: (e: ReactMouseEvent) => void;
    onKeyDown?: (e: ReactKeyboardEvent) => void;"aria-expanded"?: boolean;"aria-haspopup"?: boolean |"dialog";"aria-controls"?: string;
  }>;
  children: ReactNode;
  ariaLabel: string;
  placement?: Placement;
  openOnHover?: boolean;
  panelClassName?: string;
}

const PLACEMENT_CLASSES: Record<Placement, string> = {
  bottom:"top-full left-0 mt-2",
  top:"bottom-full left-0 mb-2",
  right:"left-full top-0 ml-2",
  left:"right-full top-0 mr-2",
};

export function Popover({
  trigger,
  children,
  ariaLabel,
  placement ="bottom",
  openOnHover = false,
  panelClassName ="",
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerReturnRef = useRef<HTMLElement | null>(null);
  const panelId = useId();
  const labelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerReturnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key ==="Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!isValidElement(trigger)) {
    throw new Error("Popover trigger must be a single React element.");
  }

  const handleTriggerClick = (e: ReactMouseEvent) => {
    triggerReturnRef.current = e.currentTarget as HTMLElement;
    setOpen((o) => !o);
    trigger.props.onClick?.(e);
  };

  const handleTriggerKey = (e: ReactKeyboardEvent) => {
    if (e.key ==="Enter" || e.key ==="") {
      e.preventDefault();
      triggerReturnRef.current = e.currentTarget as HTMLElement;
      setOpen((o) => !o);
    }
    trigger.props.onKeyDown?.(e);
  };

  const hoverHandlers = openOnHover
    ? {
        onMouseEnter: (e: ReactMouseEvent) => {
          triggerReturnRef.current = e.currentTarget as HTMLElement;
          setOpen(true);
        },
        onFocus: (e: { currentTarget: HTMLElement }) => {
          triggerReturnRef.current = e.currentTarget;
          setOpen(true);
        },
        onMouseLeave: () => setOpen(false),
        onBlur: () => setOpen(false),
      }
    : {};

  const triggerWithHandlers = cloneElement(trigger, {
    onClick: handleTriggerClick,
    onKeyDown: handleTriggerKey,"aria-expanded": open,"aria-haspopup":"dialog" as const,"aria-controls": panelId,
  });

  return (
    <span className="relative inline-block" ref={containerRef} {...hoverHandlers}>
      {triggerWithHandlers}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={ariaLabel}
          aria-labelledby={labelId}
          className={`absolute z-50 w-72 border border-border/80 bg-bg-surface/95 backdrop-blur-md px-4 py-3 text-sm text-text-primary shadow-[var(--shadow-elev-2)] ${PLACEMENT_CLASSES[placement]} ${panelClassName}`}
        >
          <span id={labelId} className="sr-only">
            {ariaLabel}
          </span>
          {children}
        </div>
      )}
    </span>
  );
}
