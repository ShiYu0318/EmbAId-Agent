"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/page";
import { TraceViewer } from "@/components/trace-viewer";
import { Button, LoadingBlock, StateBlock } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n, type TranslateFn } from "@/lib/i18n";

function TraceBody({ messageId, t }: { messageId: string; t: TranslateFn }) {
  const { api } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.messages.trace(messageId), [messageId]);

  if (loading) return <LoadingBlock label={t("common.loading")} />;
  if (error) return <StateBlock title={t("trace.notAvailable")} text={errorMessage(t, error)} />;
  if (!data) return <StateBlock title={t("trace.notAvailable")} />;

  return <TraceViewer trace={data.trace} />;
}

function TraceContent() {
  const { t } = useI18n();
  const params = useSearchParams();
  const messageId = params.get("message");

  return (
    <>
      <PageHeader
        title={t("trace.title")}
        subtitle={t("trace.subtitle")}
        actions={
          <Link href="/conversations">
            <Button>{t("trace.backToConversation")}</Button>
          </Link>
        }
      />
      {messageId ? (
        <TraceBody messageId={messageId} t={t} />
      ) : (
        <StateBlock title={t("trace.notAvailable")} />
      )}
    </>
  );
}

export default function TracePage() {
  return (
    <Suspense fallback={null}>
      <TraceContent />
    </Suspense>
  );
}
