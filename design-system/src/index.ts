/*
 * The package entry the plugin imports from.
 *
 * This exports source, not a build. plugin/ bundles these .tsx files with its
 * own esbuild, so there is no dist to keep in sync and no separate type
 * emit — the plugin's typecheck reads these files directly.
 *
 * Storybook keeps using the `#components/*` subpath imports internally; this
 * barrel exists for consumers outside the package.
 */

export { cn } from "#lib/utils"

export {
  evidenceRoles,
  lines,
  runStates,
  surfaces,
  textColors,
  type EvidenceRole,
  type Token,
  type TokenGroup,
} from "#lib/tokens"

export { Alert, AlertAction, AlertDescription, AlertTitle } from "#components/ui/alert"
export {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "#components/ui/attachment"
export { Badge, badgeVariants } from "#components/ui/badge"
export {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
} from "#components/ui/bubble"
export { Button, buttonVariants } from "#components/ui/button"
export {
  Marker,
  MarkerContent,
  MarkerIcon,
  markerVariants,
} from "#components/ui/marker"
export {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "#components/ui/message-scroller"
export { Spinner } from "#components/ui/spinner"
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "#components/ui/table"
