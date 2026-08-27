/**
 * Column definitions for the bulk-import spreadsheets.
 *
 * One definition per column, used three times: to write the downloadable
 * template, to map a parsed CSV row onto a field, and to tell the person
 * importing what a column expects. They are here rather than in either app
 * because the template a user downloads and the payload the server validates
 * have to describe the same columns — when those drift, the failure is a file
 * that looks right and imports nothing.
 */

export type ImportColumn = {
  /** Field name on the row object sent to the API. */
  key: string;
  /** Column heading in the CSV. Matched case- and space-insensitively. */
  header: string;
  required: boolean;
  /** What the column accepts, shown beside the template and in the dialog. */
  hint: string;
  /** Filled into the example row of the downloaded template. */
  example: string;
};

export const STUDENT_IMPORT_COLUMNS: ImportColumn[] = [
  {
    key: "fullName",
    header: "Full name",
    required: true,
    hint: "The student's name as it should appear on certificates.",
    example: "Ama Mensah",
  },
  {
    key: "email",
    header: "Email",
    required: true,
    hint: "Used to match against existing records. Two rows with the same email are the same person.",
    example: "ama.mensah@example.com",
  },
  {
    key: "phone",
    header: "Phone",
    required: true,
    hint: "Any format. Digits are compared, so spaces and +233 are fine.",
    example: "024 000 0000",
  },
  {
    key: "studentNumber",
    header: "Student number",
    required: false,
    hint: "Leave blank and one is generated. Must be unique if you supply it.",
    example: "",
  },
  {
    key: "status",
    header: "Status",
    required: false,
    hint: "active, suspended, completed, graduated or withdrawn. Defaults to active.",
    example: "active",
  },
  {
    key: "gender",
    header: "Gender",
    required: false,
    hint: "Free text. Optional.",
    example: "Female",
  },
  {
    key: "birthDate",
    header: "Date of birth",
    required: false,
    hint: "YYYY-MM-DD, e.g. 2001-04-19.",
    example: "2001-04-19",
  },
  {
    key: "address",
    header: "Address",
    required: false,
    hint: "Optional.",
    example: "Osu, Accra",
  },
  {
    key: "emergencyContactName",
    header: "Emergency contact name",
    required: false,
    hint: "Optional.",
    example: "Kofi Mensah",
  },
  {
    key: "emergencyContactPhone",
    header: "Emergency contact phone",
    required: false,
    hint: "Optional.",
    example: "024 111 1111",
  },
];

export const PRODUCT_IMPORT_COLUMNS: ImportColumn[] = [
  {
    key: "sku",
    header: "SKU",
    required: true,
    hint: "Your code for the item. Used to match existing stock, so it must be unique.",
    example: "BWT-SERUM-01",
  },
  {
    key: "name",
    header: "Name",
    required: true,
    hint: "What the item is called on the shelf and in the shop.",
    example: "Lumina Renewal Serum",
  },
  {
    key: "category",
    header: "Category",
    required: true,
    hint: "Matched by name. A category that does not exist yet is created.",
    example: "Skincare",
  },
  {
    key: "unitCost",
    header: "Unit cost",
    required: true,
    hint: "What you pay per unit, in GHS. Numbers only, e.g. 45.00",
    example: "45.00",
  },
  {
    key: "sellingPrice",
    header: "Selling price",
    required: true,
    hint: "What you charge per unit, in GHS. Enter 0 for items you never sell.",
    example: "80.00",
  },
  {
    key: "quantityOnHand",
    header: "Quantity on hand",
    required: false,
    hint: "Opening stock. Booked as a movement, so the ledger explains it. Defaults to 0.",
    example: "12",
  },
  {
    key: "reorderLevel",
    header: "Reorder level",
    required: false,
    hint: "Flagged as low at or below this. Defaults to 0.",
    example: "4",
  },
  {
    key: "isSellable",
    header: "Sold online",
    required: false,
    hint: "yes or no. Defaults to yes. Use no for classroom-only consumables.",
    example: "yes",
  },
  {
    key: "supplier",
    header: "Supplier",
    required: false,
    hint: "Matched by name against existing suppliers. Unknown names are left unlinked, not created.",
    example: "",
  },
  {
    key: "description",
    header: "Description",
    required: false,
    hint: "Optional.",
    example: "Brightening vitamin C serum, 30ml",
  },
];

/**
 * Normalises a heading for matching, so "Full Name", "full name" and
 * "full_name" all find the same column. Spreadsheet users retype headings.
 */
export function normaliseHeader(value: string): string {
  return value
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** Maps normalised headings to field keys for one column set. */
export function headerLookup(columns: ImportColumn[]): Map<string, string> {
  return new Map(columns.map(column => [normaliseHeader(column.header), column.key]));
}

/** Largest import accepted in one go, so a mistyped paste cannot become a job. */
export const MAX_IMPORT_ROWS = 500;
