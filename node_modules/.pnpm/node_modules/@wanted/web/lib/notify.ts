import {
  isActivityTone,
  readActivityDetail,
  type ActivityDetail,
  type ActivityFact,
  type ActivityModule,
  type ActivityRefresh,
  type ActivityRestore,
  type ActivityTone,
} from "@wanted/shared";

export type NoticeTone = ActivityTone;
export type NoticeFact = ActivityFact;
export type RefreshDetail = ActivityRefresh;
export type NoticeRestore = ActivityRestore;
export type NoticeDetail = ActivityDetail;

export type NoticeInput = {
  title: string;
  body?: string;
  tone?: NoticeTone;
  source?: string;
  module?: ActivityModule;
  share?: boolean;
  detail?: NoticeDetail;
};

export type NoticeOptions = Pick<NoticeInput, "tone" | "body" | "detail" | "share">;

export const noticeEvent = "wanted:notice";
export const refreshEvent = "wanted:refresh";

export function notify(input: NoticeInput) {
  if (typeof window === "undefined" || !input.title) {
    return;
  }
  window.dispatchEvent(new CustomEvent<NoticeInput>(noticeEvent, { detail: input }));
}

export function requestRefresh(detail: RefreshDetail) {
  window.dispatchEvent(new CustomEvent<RefreshDetail>(refreshEvent, { detail }));
}

export function isNoticeTone(value: unknown): value is NoticeTone {
  return isActivityTone(value);
}

export function readNoticeDetail(value: unknown): NoticeDetail | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return readActivityDetail(value);
}
