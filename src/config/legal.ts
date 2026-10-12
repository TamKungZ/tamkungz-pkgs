import data from "../data/legal.json";

export interface LegalPage {
  slug: string;
  title: string;
  description: string;
  sections: { heading: string; paragraphs: string[] }[];
}

/** Terms / Privacy / License. Edit the text in src/data/legal.json. */
export const LEGAL_PAGES: LegalPage[] = data;
