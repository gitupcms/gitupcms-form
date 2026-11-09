/** Bejamas token classes for React islands, so they match the .astro shell. */
export const inputClass =
  "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full min-w-0 rounded-lg border bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-3 disabled:opacity-60 md:text-sm";
export const button = (variant: "primary" | "outline" | "ghost" | "destructive" = "outline", size: "sm" | "md" | "icon" = "md") =>
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
    // primary/destructive get their gradient from .btn-emphasis in globals.css.
    { primary: "btn-emphasis", outline: "border bg-background hover:bg-muted", ghost: "hover:bg-muted", destructive: "btn-emphasis btn-danger" }[variant],
    { sm: "h-7 px-2 text-xs [&_svg]:size-3.5", md: "h-9 px-3", icon: "size-8" }[size],
  ].join(" ");
export const sectionLabel = "text-muted-foreground text-xs font-medium tracking-wider uppercase";
/** Bejamas Tabs (variant "default") for islands: put `data-state="active"` on the selected trigger. */
export const tabList = "text-muted-foreground inline-flex h-9 w-fit items-center rounded-lg bg-muted p-[3px]";
export const tabTrigger =
  "inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 py-1 text-sm font-medium outline-none transition-all text-foreground/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-muted-foreground dark:hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 [&_svg]:size-4";
