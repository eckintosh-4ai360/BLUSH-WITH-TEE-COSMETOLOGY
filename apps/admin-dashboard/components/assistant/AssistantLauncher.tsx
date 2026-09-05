"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@blush/ui/components/ui/tooltip";
import { AssistantPanel } from "./AssistantPanel";

/**
 * Opens the assistant from the dashboard header.
 *
 * The panel itself is mounted here rather than in the layout so the whole
 * feature is one import, and Ctrl+/ reaches it from any screen without hunting
 * for the button.
 */
export function AssistantLauncher() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Open the assistant"
            className="size-9 rounded-lg"
          >
            <Sparkles className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Assistant (Ctrl + /)</TooltipContent>
      </Tooltip>

      <AssistantPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
