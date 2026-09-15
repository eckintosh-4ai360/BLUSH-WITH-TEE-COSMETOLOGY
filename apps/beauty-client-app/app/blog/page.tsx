import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PublicShell from "@/components/PublicShell";
import { formatPostDate, publicContent } from "@/lib/serverContent";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Blog",
  description:
    "News, beauty tips and career advice from Blush With Tee School of Cosmetology.",
  alternates: { canonical: "/blog" },
};

type Props = { searchParams: Promise<{ category?: string }> };

export default async function BlogPage({ searchParams }: Props) {
  const { category } = await searchParams;
  const content = publicContent();
  const [posts, categories] = await Promise.all([
    content.blogPosts({ category: category || undefined, limit: 60 }),
    content.blogCategories(),
  ]);
  const activeCategory = categories.find(entry => entry.slug === category);

  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">Blush With Tee Journal</p>
          <h1 className="mt-5 font-serif text-5xl font-bold leading-none text-[#8f0d6b] sm:text-6xl">
            {activeCategory ? activeCategory.name : "Stories from the studio."}
          </h1>
          <p className="mt-6 text-lg leading-8 text-[#692156]">
            News from the school, beauty tips and advice for building a career in cosmetology.
          </p>
        </div>

        {categories.length ? (
          <nav className="mt-10 flex flex-wrap gap-2" aria-label="Blog categories">
            <CategoryChip href="/blog" active={!activeCategory} label="All posts" />
            {categories.map(entry => (
              <CategoryChip
                key={entry.slug}
                href={`/blog?category=${encodeURIComponent(entry.slug)}`}
                active={activeCategory?.slug === entry.slug}
                label={entry.name}
              />
            ))}
          </nav>
        ) : null}

        {posts.length ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map(post => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-[2rem] border border-[#8f0d6b]/12 bg-white shadow-[0_8px_28px_rgba(143,13,107,.06)] transition-all hover:-translate-y-1 hover:border-[#fe00b6]/35 hover:shadow-[0_18px_44px_rgba(143,13,107,.12)]"
              >
                {post.featuredImageUrl ? (
                  <div className="aspect-[16/10] max-w-full overflow-hidden bg-[#faeaf6]">
                    <img
                      src={post.featuredImageUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/10] max-w-full bg-gradient-to-br from-[#faeaf6] via-white to-[#fdf2fa]" />
                )}
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#fe00b6]">
                    {[post.categoryName, formatPostDate(post.publishedAt)].filter(Boolean).join(" · ")}
                  </p>
                  <h2 className="mt-3 font-serif text-2xl font-bold leading-snug text-[#8f0d6b]">{post.title}</h2>
                  {post.excerpt ? (
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#692156]">{post.excerpt}</p>
                  ) : null}
                  <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-semibold text-[#fe00b6]">
                    Read the post <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-[2rem] border border-dashed border-[#8f0d6b]/25 bg-white/60 p-10 text-center">
            <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">
              {activeCategory ? "No posts in this category yet." : "The first posts are on their way."}
            </h2>
            <p className="mt-3 text-sm text-[#692156]">
              {activeCategory ? (
                <Link href="/blog" className="font-semibold text-[#fe00b6] underline underline-offset-4">
                  See all posts
                </Link>
              ) : (
                "Check back soon for news and tips from the studio."
              )}
            </p>
          </div>
        )}
      </main>
    </PublicShell>
  );
}

function CategoryChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-[#8f0d6b] bg-[#8f0d6b] text-white"
          : "border-[#8f0d6b]/20 bg-white text-[#8f0d6b] hover:border-[#fe00b6]/50"
      }`}
    >
      {label}
    </Link>
  );
}
