"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  HelpCircle,
  ImageIcon,
  Inbox,
  Megaphone,
  MessageSquareQuote,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Card } from "@blush/ui/components/ui/card";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import { Switch } from "@blush/ui/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@blush/ui/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import { BannerDialog, type BannerEntry } from "@/components/website/BannerDialog";
import { StatusControl, type ContentKind, type PublishStatus } from "@/components/website/ContentStatus";
import { EventDialog, type EventEntry } from "@/components/website/EventDialog";
import { FaqDialog, type FaqEntry } from "@/components/website/FaqDialog";
import {
  GALLERY_CATEGORY_LABELS,
  GalleryDialog,
  type GalleryEntry,
} from "@/components/website/GalleryDialog";
import { TestimonialDialog, type TestimonialEntry } from "@/components/website/TestimonialDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function WebsiteContentPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["cms.read"]}>
        <WebsiteContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// What the public website shows beyond the catalogue: banners, gallery, events, testimonials and
// questions. Everything is published, unpublished or archived here; nothing is deleted.
function WebsiteContent() {
  const { can } = usePermissions();
  const writable = can("cms.write");
  const [showArchived, setShowArchived] = useState(false);

  const banners = trpc.cms.banners.useQuery();
  const gallery = trpc.cms.gallery.useQuery();
  const events = trpc.cms.events.useQuery();
  const testimonials = trpc.cms.testimonials.useQuery();
  const faqs = trpc.cms.faqs.useQuery();
  const enquiries = trpc.cms.enquiries.useQuery();

  const [bannerEdit, setBannerEdit] = useState<BannerEntry | null | "new">(null);
  const [galleryEdit, setGalleryEdit] = useState<GalleryEntry | null | "new">(null);
  const [eventEdit, setEventEdit] = useState<EventEntry | null | "new">(null);
  const [testimonialEdit, setTestimonialEdit] = useState<TestimonialEntry | null | "new">(null);
  const [faqEdit, setFaqEdit] = useState<FaqEntry | null | "new">(null);

  const visible = <T extends { status: PublishStatus }>(rows: T[] | undefined) =>
    (rows ?? []).filter(row => showArchived || row.status !== "archived");

  const saved = (message: string, refetch: () => unknown) => () => {
    toast.success(message);
    void refetch();
  };

  const setEnquiryStatus = trpc.cms.setEnquiryStatus.useMutation({
    onSuccess: saved("Enquiry updated.", enquiries.refetch),
    onError: error => toast.error(error.message),
  });
  const deleteEnquiry = trpc.cms.deleteEnquiry.useMutation({
    onSuccess: saved("Enquiry deleted.", enquiries.refetch),
    onError: error => toast.error(error.message),
  });

  const deleteFaq = trpc.cms.deleteFaq.useMutation({
    onSuccess: saved("Question deleted.", faqs.refetch),
    onError: error => toast.error(error.message),
  });

  const deleteBanner = trpc.cms.deleteBanner.useMutation({
    onSuccess: saved("Banner deleted.", banners.refetch),
    onError: error => toast.error(error.message),
  });

  const deleteEvent = trpc.cms.deleteEvent.useMutation({
    onSuccess: saved("Event deleted.", events.refetch),
    onError: error => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Website content</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Banners, gallery photos, events, testimonials and questions for the public website. Published
            entries appear on the site within a few minutes; drafts and archived entries do not.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived entries" />
          Show archived
        </label>
      </header>

      <Tabs defaultValue="banners">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="banners" className="gap-1.5">
            <Megaphone className="h-3.5 w-3.5" /> Banners
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> Gallery
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Events
          </TabsTrigger>
          <TabsTrigger value="testimonials" className="gap-1.5">
            <MessageSquareQuote className="h-3.5 w-3.5" /> Testimonials
          </TabsTrigger>
          <TabsTrigger value="faqs" className="gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" /> FAQs
          </TabsTrigger>
          <TabsTrigger value="enquiries" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" /> Enquiries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="banners" className="mt-4">
          <Section
            title="Banners"
            hint="Homepage banners sit under the opening photo; the first published announcement runs across the top of every page."
            addLabel="Add banner"
            writable={writable}
            onAdd={() => setBannerEdit("new")}
            loading={banners.isLoading}
            error={banners.error?.message}
            empty="No banners yet."
          >
            {visible(banners.data).map(row => (
              <EntryRow
                key={row.id}
                kind="banner"
                id={row.id}
                status={row.status}
                writable={writable}
                imageUrl={row.imageUrl}
                title={row.title}
                meta={[
                  row.placement === "announcement" ? "Announcement strip" : "Homepage banner",
                  row.ctaLabel && row.ctaHref ? `Button: ${row.ctaLabel} → ${row.ctaHref}` : null,
                ]}
                detail={row.subtitle}
                onEdit={() => setBannerEdit(row)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `Delete the banner "${row.title}"? It will be removed from the website.`,
                    )
                  ) {
                    deleteBanner.mutate({ id: row.id });
                  }
                }}
                onChanged={() => void banners.refetch()}
              />
            ))}
          </Section>
        </TabsContent>

        <TabsContent value="gallery" className="mt-4">
          <Section
            title="Gallery"
            hint="Once any photo is published, the gallery page shows your photos instead of the placeholder pictures."
            addLabel="Add photo"
            writable={writable}
            onAdd={() => setGalleryEdit("new")}
            loading={gallery.isLoading}
            error={gallery.error?.message}
            empty="No gallery photos yet."
          >
            {visible(gallery.data).map(row => (
              <EntryRow
                key={row.id}
                kind="gallery"
                id={row.id}
                status={row.status}
                writable={writable}
                imageUrl={row.imageUrl}
                title={row.title ?? "Untitled photo"}
                meta={[GALLERY_CATEGORY_LABELS[row.category] ?? row.category]}
                detail={row.caption}
                onEdit={() => setGalleryEdit(row as GalleryEntry)}
                onChanged={() => void gallery.refetch()}
              />
            ))}
          </Section>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Section
            title="Events"
            hint="Published events show on the homepage until they are over."
            addLabel="Add event"
            writable={writable}
            onAdd={() => setEventEdit("new")}
            loading={events.isLoading}
            error={events.error?.message}
            empty="No events yet."
          >
            {visible(events.data).map(row => {
              const over = new Date(row.endsAt ?? row.startsAt) < new Date();
              return (
                <EntryRow
                  key={row.id}
                  kind="event"
                  id={row.id}
                  status={row.status}
                  writable={writable}
                  imageUrl={row.imageUrl}
                  title={row.title}
                  meta={[WHEN.format(new Date(row.startsAt)), row.location, over ? "Finished" : null]}
                  detail={row.summary}
                  onEdit={() => setEventEdit(row)}
                  onDelete={() => {
                    if (
                      window.confirm(
                        `Delete the event "${row.title}"? It will be removed from the website.`,
                      )
                    ) {
                      deleteEvent.mutate({ id: row.id });
                    }
                  }}
                  onChanged={() => void events.refetch()}
                />
              );
            })}
          </Section>
        </TabsContent>

        <TabsContent value="testimonials" className="mt-4">
          <Section
            title="Testimonials"
            hint="The homepage shows published testimonials, and hides the section while there are none."
            addLabel="Add testimonial"
            writable={writable}
            onAdd={() => setTestimonialEdit("new")}
            loading={testimonials.isLoading}
            error={testimonials.error?.message}
            empty="No testimonials yet."
          >
            {visible(testimonials.data).map(row => (
              <EntryRow
                key={row.id}
                kind="testimonial"
                id={row.id}
                status={row.status}
                writable={writable}
                imageUrl={row.photoUrl}
                title={row.authorName}
                meta={[
                  row.authorRole,
                  row.rating ? (
                    <span key="rating" className="inline-flex items-center gap-0.5">
                      {row.rating} <Star className="h-3 w-3" />
                    </span>
                  ) : null,
                ]}
                detail={`“${row.quote}”`}
                onEdit={() => setTestimonialEdit(row)}
                onChanged={() => void testimonials.refetch()}
              />
            ))}
          </Section>
        </TabsContent>

        <TabsContent value="faqs" className="mt-4">
          <Section
            title="Frequently asked questions"
            hint="Published questions show on the contact page, and the website assistant answers from them."
            addLabel="Add question"
            writable={writable}
            onAdd={() => setFaqEdit("new")}
            loading={faqs.isLoading}
            error={faqs.error?.message}
            empty="No questions yet."
          >
            {visible(faqs.data).map(row => (
              <EntryRow
                key={row.id}
                kind="faq"
                id={row.id}
                status={row.status}
                writable={writable}
                title={row.question}
                meta={[row.category]}
                detail={row.answer}
                onEdit={() => setFaqEdit(row)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `Delete the question "${row.question}"? It will be removed from the website.`,
                    )
                  ) {
                    deleteFaq.mutate({ id: row.id });
                  }
                }}
                onChanged={() => void faqs.refetch()}
              />
            ))}
          </Section>
        </TabsContent>
        <TabsContent value="enquiries" className="mt-4">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Enquiries</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Messages sent from the contact page on the public site. The sender also receives a copy
              by email when the mailbox is configured.
            </p>
            {enquiries.isLoading ? (
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map(index => (
                  <Skeleton key={index} className="h-20 w-full" />
                ))}
              </div>
            ) : enquiries.error ? (
              <p className="mt-4 text-sm text-destructive">{enquiries.error.message}</p>
            ) : !enquiries.data?.length ? (
              <p className="mt-4 text-sm text-muted-foreground">No enquiries yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {enquiries.data.map(row => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{row.name}</span>
                        <span className="text-sm text-muted-foreground">{row.email}</span>
                        {row.phone ? (
                          <span className="text-sm text-muted-foreground">{row.phone}</span>
                        ) : null}
                        <Badge variant={row.status === "new" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                      </div>
                      {row.subject ? (
                        <p className="mt-1 text-sm font-medium">{row.subject}</p>
                      ) : null}
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {row.message}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {WHEN.format(new Date(row.createdAt))}
                      </p>
                    </div>
                    {writable ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setEnquiryStatus.isPending}
                          onClick={() =>
                            setEnquiryStatus.mutate({
                              id: row.id,
                              status: row.status === "new" ? "handled" : "new",
                            })
                          }
                        >
                          {row.status === "new" ? (
                            <>
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark handled
                            </>
                          ) : (
                            <>
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Mark new
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={deleteEnquiry.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete the enquiry from ${row.name}?`)) {
                              deleteEnquiry.mutate({ id: row.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <BannerDialog
        open={bannerEdit !== null}
        onOpenChange={open => !open && setBannerEdit(null)}
        editing={bannerEdit === "new" ? null : bannerEdit}
        onSaved={saved("Banner saved.", banners.refetch)}
      />
      <GalleryDialog
        open={galleryEdit !== null}
        onOpenChange={open => !open && setGalleryEdit(null)}
        editing={galleryEdit === "new" ? null : galleryEdit}
        onSaved={saved("Photo saved.", gallery.refetch)}
      />
      <EventDialog
        open={eventEdit !== null}
        onOpenChange={open => !open && setEventEdit(null)}
        editing={eventEdit === "new" ? null : eventEdit}
        onSaved={saved("Event saved.", events.refetch)}
      />
      <TestimonialDialog
        open={testimonialEdit !== null}
        onOpenChange={open => !open && setTestimonialEdit(null)}
        editing={testimonialEdit === "new" ? null : testimonialEdit}
        onSaved={saved("Testimonial saved.", testimonials.refetch)}
      />
      <FaqDialog
        open={faqEdit !== null}
        onOpenChange={open => !open && setFaqEdit(null)}
        editing={faqEdit === "new" ? null : faqEdit}
        onSaved={saved("Question saved.", faqs.refetch)}
      />
    </div>
  );
}

function Section({
  title,
  hint,
  addLabel,
  writable,
  onAdd,
  loading,
  error,
  empty,
  children,
}: {
  title: string;
  hint: string;
  addLabel: string;
  writable: boolean;
  onAdd: () => void;
  loading: boolean;
  error?: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">{hint}</p>
        </div>
        {writable ? (
          <Button size="sm" className="gap-1.5" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </Button>
        ) : null}
      </div>
      {loading ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : error ? (
        <p className="p-5 text-sm text-destructive">{error}</p>
      ) : children.length ? (
        <ul className="divide-y divide-border/50">{children}</ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}

function EntryRow({
  kind,
  id,
  status,
  writable,
  imageUrl,
  title,
  meta,
  detail,
  onEdit,
  onDelete,
  onChanged,
}: {
  kind: ContentKind;
  id: number;
  status: PublishStatus;
  writable: boolean;
  imageUrl?: string | null;
  title: string;
  meta: ReactNode[];
  detail?: string | null;
  onEdit: () => void;
  onDelete?: () => void;
  onChanged: () => void;
}) {
  const shownMeta = meta.filter(Boolean);
  return (
    <li className={`flex flex-wrap items-center gap-4 px-5 py-3 ${status === "archived" ? "opacity-60" : ""}`}>
      {imageUrl !== undefined ? (
        imageUrl ? (
          <img src={imageUrl} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </span>
        )
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {shownMeta.length ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {shownMeta.map((item, index) => (
              <span key={index}>{item}</span>
            ))}
          </p>
        ) : null}
        {detail ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <StatusControl kind={kind} id={id} status={status} writable={writable} onChanged={onChanged} />
      {writable ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Edit ${title}`} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {onDelete && writable ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          aria-label={`Delete ${title}`}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </li>
  );
}
