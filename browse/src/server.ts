export interface BrowseServerStatus {
  ready: boolean;
  message: string;
}

export function getBrowseServerStatus(): BrowseServerStatus {
  return {
    ready: false,
    message: "Persistent browser daemon not implemented yet.",
  };
}
