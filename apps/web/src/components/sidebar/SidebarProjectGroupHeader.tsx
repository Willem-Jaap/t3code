import { ChevronRightIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { ProjectFavicon } from "../ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

// Not sortable: grouped rows keep project order, so headers never take part in a drag.
export function SidebarProjectGroupHeader(props: {
  project: SidebarProjectSnapshot;
  threadCount: number;
  expanded: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  onNewThread: () => void;
}) {
  const label = props.expanded ? "Hide its threads" : "Show its threads";
  return (
    <li
      data-thread-selection-safe
      data-testid="sidebar-project-group-header"
      className="group/project-header mt-1 list-none first:mt-0"
    >
      <div className="relative flex h-8 items-center rounded-md hover:bg-sidebar-row-hover">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-expanded={props.expanded}
                aria-label={`${props.project.displayName}: ${label}`}
                onClick={props.onToggle}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs-plus font-medium text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            }
          >
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              {/* The chevron stands in for the favicon on hover, as in a file tree. */}
              <span className="group-hover/project-header:opacity-0 group-focus-within/project-header:opacity-0">
                <ProjectFavicon project={props.project} className="size-4" />
              </span>
              <ChevronRightIcon
                aria-hidden
                className={cn(
                  "absolute size-4 text-sidebar-muted-foreground opacity-0 transition-transform group-hover/project-header:opacity-100 group-focus-within/project-header:opacity-100 motion-reduce:transition-none",
                  props.expanded && "rotate-90",
                )}
              />
            </span>
            <span className="min-w-0 truncate">{props.project.displayName}</span>
            {props.threadCount > 0 ? (
              <span className="shrink-0 text-2xs font-normal text-sidebar-muted-foreground tabular-nums">
                {props.threadCount}
              </span>
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="bottom">{label}</TooltipPopup>
        </Tooltip>
        <span className="mr-1 flex shrink-0 items-center opacity-0 group-hover/project-header:opacity-100 group-focus-within/project-header:opacity-100">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`${props.project.displayName} settings`}
                  onClick={props.onOpenSettings}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                />
              }
            >
              <SettingsIcon aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="top">Project settings</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`New thread in ${props.project.displayName}`}
                  onClick={props.onNewThread}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                />
              }
            >
              <PlusIcon aria-hidden className="size-4" />
            </TooltipTrigger>
            <TooltipPopup side="top">New thread</TooltipPopup>
          </Tooltip>
        </span>
      </div>
    </li>
  );
}
