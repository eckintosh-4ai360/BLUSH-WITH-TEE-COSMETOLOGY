import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ArticleBody } from "@/components/ArticleBody";
import PublicShell from "@/components/PublicShell";
import { formatPostDate, publicContent } from "@/lib/serverContent";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await publicContent().blogPost({ slug });
  if (!post) return { title: "Post not found", robots: { index: false } };

  const description = post.seoDescription ?? post.excerpt ?? undefined;
  return {
    title: post.seoTitle || post.title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.seoTitle || post.title,
      description,
      publishedTime: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
      authors: post.authorName ? [post.authorName] : undefined,
      images: post.featuredImageUrl ? [post.featuredImageUrl] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await publicContent().blogPost({ slug });
  if (!post) notFound();

  const date = formatPostDate(post.publishedAt);

  return (
    <PublicShell>
      <main className="container max-w-3xl py-14 sm:py-20">
        <Link
          href={post.categorySlug ? `/blog?category=${encodeURIComponent(post.categorySlug)}` : "/blog"}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8f0d6b] transition-colors hover:text-[#fe00b6]"
        >
          <ArrowLeft className="h-4 w-4" />
          {post.categoryName ?? "All posts"}
        </Link>

        <h1 className="mt-6 font-serif text-4xl font-bold leading-tight text-[#8f0d6b] sm:text-5xl">{post.title}</h1>

        {date || post.authorName ? (
          <p className="mt-5 text-sm font-semibold uppercase tracking-widest text-[#fe00b6]">
            {[post.authorName, date].filter(Boolean).join(" · ")}
          </p>
        ) : null}

        {post.excerpt ? <p className="mt-6 text-xl leading-9 text-[#692156]">{post.excerpt}</p> : null}

        {post.featuredImageUrl ? (
          <img
            src={post.featuredImageUrl}
            alt=""
            className="mt-10 aspect-[16/9] w-full max-w-full rounded-[2rem] object-cover shadow-[0_18px_48px_rgba(143,13,107,.12)]"
          />
        ) : null}

        <article className="mt-10">
          <ArticleBody text={post.content} />
        </article>

        {post.tags.length ? (
          <ul className="mt-12 flex flex-wrap gap-2 border-t border-[#8f0d6b]/10 pt-6" aria-label="Tags">
            {post.tags.map(tag => (
              <li key={tag} className="rounded-full bg-[#faeaf6] px-3 py-1 text-xs font-semibold text-[#8f0d6b]">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </PublicShell>
  );
}
