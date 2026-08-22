# Roadmap

What the brief asks for that is not built yet, honestly stated. Ordered by what
would deliver most next.

## Backend exists, screens do not

These have working, permission-checked, tested procedures. They need interfaces.

| Area | What exists | What is missing |
|---|---|---|
| Purchase orders | `createPurchaseOrder`, `receivePurchaseOrder`, `paySupplier` | Raise / receive screens |
| Suppliers | Full CRUD and detail with purchase history | Edit form, supplier detail page |
| Fee structures | `upsertFeeStructure`, `createCharge`, `adjust` | Fee configuration screen |
| Student accounts | `studentAccount` with the full equation | Student detail page |
| Products | Catalogue, categories, images, variations in the schema | Product management screens |

## Not built at all

### Reports and exports (§42, §65)
Tables export CSV today. Missing: PDF and Excel with the school logo, report
title, filters used, who generated it, totals and page numbers; and the
standard report set (student lists, graduates, fee collection, income vs
expenses, profit and loss, stock valuation, attendance, course performance).

### Printable documents (§66, §67, §68)
Payment receipts, fee statements, admission letters, order invoices, printable
certificates, completion letters. The data is all there; the branded templates
and PDF rendering are not.

### Content management (§39, §40, §41)
Tables exist for pages, banners, services, events, gallery, testimonials, FAQs
and blog posts, and the seed populates several. Missing: the admin screens to
edit them, and the public pages that read them rather than hard-coded copy.

### Academic screens (§22, §23)
Course modules, classes, class sessions, attendance records and assessment
results are modelled and seeded. Missing: the timetable, the attendance
register, and the score-entry screen instructors would use.

### Customer CRM (§34)
`customers` and `customerAddresses` exist and orders link to them. Missing: the
customer list, the profile with purchase history and favourite products, and
notes.

### Staff management (§32)
Staff profiles and assignments exist, with salary behind its own permission.
Missing: the profile screens and course assignment interface.

### Student and instructor portals (§35, §36)
The student portal shows profile, attendance, results, fees and orders. Missing:
online fee payment on the page (the API is complete and verified), certificate
download, admission letter download, and the instructor portal for attendance
and scores.

## Cross-cutting

| Item | Note |
|---|---|
| **Two-factor authentication** (§45) | Modelled, not implemented |
| **Rate limiting** (§57) | Belongs at the edge; verification endpoint first |
| **Notification transport** (§38) | Rows are queued; nothing drains them yet |
| **Background jobs** (§56) | Low-stock alerts and fee reminders need a scheduler |
| **SEO** (§55) | Slugs and meta fields exist; sitemap, robots.txt and structured data do not |
| **Coupons** (§51) | Table and order link exist; nothing applies them at checkout |

## Testing

92 unit tests cover money arithmetic, fee allocation, refund guards, the order
state machine, gateway verification, permissions, pagination and uploads. A
smoke run exercises 29 endpoints against real data.

Missing: integration tests against a throwaway database for the transactional
paths — payment capture, stock deduction under concurrency, duplicate webhook
handling. These are the highest-value tests still to write, because they cover
the code where a bug costs money.
