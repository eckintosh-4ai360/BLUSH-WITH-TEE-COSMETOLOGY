import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ArticleBody } from "@/components/ArticleBody";
import PublicShell from "@/components/PublicShell";
import { publicContent } from "@/lib/serverContent";

// Edits in the dashboard reach the page within five minutes.
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await publicContent().page({ slug });
  if (!page) return { title: "Page not found", robots: { index: false } };

  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription ?? undefined,
    alternates: { canonical: `/pages/${page.slug}` },
    openGraph: page.ogImageUrl ? { images: [page.ogImageUrl] } : undefined,
  };
}

export default async function WebsitePage({ params }: Props) {
  const { slug } = await params;
  const page = await publicContent().page({ slug });
  if (!page) notFound();

  return (
    <PublicShell>
      <main className="container max-w-3xl py-14 sm:py-20">
        <nav className="mb-8 flex items-center gap-1.5 text-xs text-[#8f0d6b]/60" aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:text-[#fe00b6]">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-semibold text-[#8f0d6b]">{page.title}</span>
        </nav>

        <h1 className="font-serif text-4xl font-bold leading-tight text-[#8f0d6b] sm:text-5xl">{page.title}</h1>

        <div className="mt-10">
          <ArticleBody text={page.content} />
        </div>
      </main>
    </PublicShell>
  );
}
