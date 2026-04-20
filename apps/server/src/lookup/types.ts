import type {
  CreditInline,
  ItemKind,
  LookupCandidate,
  LookupDetail,
  LookupSource,
} from "@reel/shared";

export type { CreditInline, ItemKind, LookupCandidate, LookupDetail, LookupSource };

export interface LookupAdapter {
  source: LookupSource;
  isConfigured(env: Record<string, string | undefined>): boolean;
  search(
    env: Record<string, string | undefined>,
    kind: ItemKind,
    query: string,
    signal?: AbortSignal,
  ): Promise<LookupCandidate[]>;
  detail(
    env: Record<string, string | undefined>,
    kind: ItemKind,
    externalId: string,
    signal?: AbortSignal,
  ): Promise<LookupDetail | null>;
}
