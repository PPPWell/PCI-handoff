import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";
import { parse } from "yaml";
import type { Locale } from "../i18n";
import { infoPageIds } from "./routes";
import type { InfoContent } from "./types";

export function validateInfoContent(value: unknown, source: string): asserts value is InfoContent {
  const fail: (field: string) => never = (field) => { throw new Error(`${source}.${field}: required or invalid content`); };
  const record = (value: unknown, field: string): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail(field);
  const text = (value: unknown, field: string): void => { if (typeof value !== "string" || !value.trim()) fail(field); };
  const hasPlaceholder = (value: unknown): boolean => typeof value === "string" ? /\[[^\]]*\](?!\((?:\/|mailto:)[^)\s]*\))/.test(value) : Array.isArray(value) ? value.some(hasPlaceholder) : !!value && typeof value === "object" ? Object.values(value).some(hasPlaceholder) : false;
  const root = record(value, "root"), pages = record(root.pages, "pages"), labels = record(root.labels, "labels");
  for (const key of ["preview", "closed", "contactHeading", "legalOnThisPage", "legalEffective", "contactPartners", "contactSupport", "subscribeClosed", "legalPending", "invalidConfirmation", "invalidUnsubscribe", "name", "business", "phone", "email", "message", "topic", "shortCode", "send", "subscribe", "consent", "supportEmail", "partnerEmail", "supportHours", "related", "gift", "giftDescription", "giftPreview", "teamPhoto", "restaurantPhoto", "privacy"]) text(labels[key], `labels.${key}`);
  if (!Array.isArray(root.topics) || !root.topics.length) fail("topics");
  root.topics.forEach((value, index) => text(value, `topics[${index}]`));
  for (const id of infoPageIds) {
    const path = `pages.${id}`, page = record(pages[id], path);
    if (!["preview", "published"].includes(String(page.status))) fail(`${path}.status`);
    text(page.title, `${path}.title`);text(page.description, `${path}.description`);
    if (!Array.isArray(page.sections) || !page.sections.length) fail(`${path}.sections`);
    const ids = new Set();
    page.sections.forEach((value, index) => {
      const pathSection = `${path}.sections[${index}]`, section = record(value, pathSection);
      text(section.id, `${pathSection}.id`);if (!/^[a-z][a-z0-9-]*$/.test(String(section.id)) || ids.has(section.id)) fail(`${pathSection}.id`);ids.add(section.id);
      text(section.heading, `${pathSection}.heading`);
      if (!Array.isArray(section.paragraphs) || !section.paragraphs.length) fail(`${pathSection}.paragraphs`);
      section.paragraphs.forEach((value, index) => text(value, `${pathSection}.paragraphs[${index}]`));
      if (section.questions !== undefined) {
        if (!Array.isArray(section.questions) || !section.questions.length) fail(`${pathSection}.questions`);
        section.questions.forEach((value, index) => { const question = record(value, `${pathSection}.questions[${index}]`);text(question.question, `${pathSection}.questions[${index}].question`);text(question.answer, `${pathSection}.questions[${index}].answer`); });
      }
      if (section.bullets !== undefined) { if (!Array.isArray(section.bullets) || !section.bullets.length) fail(`${pathSection}.bullets`);section.bullets.forEach((value, index) => text(value, `${pathSection}.bullets[${index}]`)); }
    });
    if (page.status === "published" && hasPlaceholder(page)) throw new Error(`${source}.${path}: placeholder content cannot be published`);
  }
}
export const getInfoContent = cache((locale: Locale): InfoContent => {
  const file = join(process.cwd(), "content", "info", `${locale}.yaml`), value: unknown = parse(readFileSync(file, "utf8"));
  validateInfoContent(value, `content/info/${locale}.yaml`);return value;
});
