import type {
  CreditInline,
  WorkKind,
  LookupCandidate,
  LookupDetail,
  LookupSource,
} from "@reel/shared";

export type { CreditInline, WorkKind, LookupCandidate, LookupDetail, LookupSource };

export interface LookupAdapter {
  source: LookupSource;
  isConfigured(env: Record<string, string | undefined>): boolean;
  search(
    env: Record<string, string | undefined>,
    kind: WorkKind,
    query: string,
    signal?: AbortSignal,
  ): Promise<LookupCandidate[]>;
  detail(
    env: Record<string, string | undefined>,
    kind: WorkKind,
    externalId: string,
    signal?: AbortSignal,
  ): Promise<LookupDetail | null>;
}
