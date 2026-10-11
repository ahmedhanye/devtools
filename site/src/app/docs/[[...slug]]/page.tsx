import { notFound } from "next/navigation";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Card, Cards } from "fumadocs-ui/components/card";
import { File, Folder, Files } from "fumadocs-ui/components/files";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { Callout } from "fumadocs-ui/components/callout";
import { resolveDocPage, source } from "@/lib/source";
import { resolvePageDetails } from "@/lib/docs-index";
import { Mermaid } from "@/components/mermaid";

interface PageProps {
  params: Promise<{
    slug?: string[];
  }>;
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;

  const page = resolveDocPage(slug);

  if (!page) {
    notFound();
  }

  const details = resolvePageDetails(page);
  const title = page.data.title || details.title;
  const description = page.data.description || details.description;
  const MDX = page.data.body;

  const section =
    page.path === "index.mdx" || page.path.startsWith("tutorials/")
      ? "tutorials"
      : slug?.[0];

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      breadcrumb={{ enabled: true }}
      tableOfContent={{ enabled: true }}
      tableOfContentPopover={{ enabled: true }}
      className={section ? `${section} group-${section}` : ""}
      style={
        section
          ? ({
              "--color-fd-primary": `var(--${section}-color)`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <DocsTitle>{title}</DocsTitle>
      {description ? <DocsDescription>{description}</DocsDescription> : null}
      <DocsBody>
        {typeof MDX === "function" ? (
          <MDX
            components={{
              ...defaultMdxComponents,
              Step,
              Steps,
              Tab,
              Tabs,
              Card,
              Cards,
              File,
              Folder,
              Files,
              Accordion,
              Accordions,
              TypeTable,
              Callout,
              Mermaid,
            }}
          />
        ) : (
          <div>
            <p>{description || details.content}</p>
          </div>
        )}
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;

  const page = resolveDocPage(slug);

  if (!page) {
    return {
      title: "Not Found",
    };
  }

  const details = resolvePageDetails(page);

  return {
    title: page.data.title || details.title,
    description: page.data.description || details.description,
  };
}
