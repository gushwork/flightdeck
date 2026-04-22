"use client";

import Link from "next/link";
import {
  DIRECTORY_GROUPS,
  type DirectoryGroup,
  type DirectorySubsection,
} from "@/lib/modules/overview-directory";

const toolRowClass =
  "group -mx-2 flex flex-col gap-1 rounded-lg px-2 py-3.5 transition-colors sm:-mx-3 sm:px-3 " +
  "hover:bg-(--bg-hover) " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20";

function GroupHeaderIcon({ groupId }: { groupId: DirectoryGroup["id"] }) {
  const iconWrap =
    groupId === "aws"
      ? "bg-(--accent)/10"
      : groupId === "fly"
        ? "bg-[#7B36F6]/10"
        : "bg-(--text-secondary)/10 text-(--text-secondary)";

  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}
    >
      {groupId === "aws" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#232F3E"
            d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z"
          />
        </svg>
      ) : groupId === "fly" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#7B36F6"
            d="M11.987 0c-2.45-.01-5.002.925-6.541 2.897-1.17 1.502-1.664 3.474-1.49 5.356.29 2.112 1.476 3.96 2.676 5.672a41.5 41.5 0 0 0 4.216 4.831c-1.063.832-1.943 2.286-1.357 3.644.821 2.32 4.665 2.05 5.122-.372.39-1.288-.694-2.533-1.428-3.309 2.388-2.431 4.706-5.036 6.17-8.145.595-1.32.902-2.802.614-4.24-.28-2.341-1.823-4.473-3.967-5.46C14.76.266 13.364.016 11.987 0m-.236 1.577v15.534C9.881 13.483 7.724 9.266 8.73 5.069c.35-1.539 1.253-3.309 3.02-3.492m1.996.04c1.534.357 3.031 1.096 3.906 2.48 1.3 1.93 1.318 4.55.1 6.521-1.268 2.395-3.06 4.463-4.916 6.415 1.472-2.974 3.074-6.106 3.182-9.5-.043-2.08-.438-4.612-2.272-5.916M11.97 20.103c.848.342 1.597 1.983.153 2.173-.664.15-1.367-.599-.995-1.222.213-.355.488-.73.842-.95"
          />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      )}
    </span>
  );
}

function DirectoryGroupSection({ group }: { group: DirectoryGroup }) {
  const headingId = `dir-group-${group.id}`;

  return (
    <section
      className="overflow-hidden rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm"
      aria-labelledby={headingId}
    >
      <div className="border-b border-(--border-hairline) bg-(--bg-deep)/40 px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <GroupHeaderIcon groupId={group.id} />
          <div className="min-w-0 flex-1 space-y-2">
            <h3
              id={headingId}
              className="font-(family-name:--font-display) text-lg font-medium text-(--text-primary)"
            >
              {group.title}
            </h3>
            <p className="max-w-2xl text-sm leading-relaxed text-(--text-secondary)">
              {group.lead}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 sm:px-8 sm:py-10">
        <div className="space-y-10 sm:space-y-12">
          {group.subsections.map((sub) => (
            <Subsection key={sub.id} subsection={sub} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Subsection({ subsection }: { subsection: DirectorySubsection }) {
  return (
    <div>
      <h4 className="mb-4 text-xs font-medium tracking-wide text-(--text-muted)">
        {subsection.title}
      </h4>
      <ul className="flex flex-col gap-2">
        {subsection.links.map((link) => (
          <li key={`${subsection.id}-${link.href}`}>
            <Link href={link.href} className={toolRowClass}>
              <span className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-(--text-primary) group-hover:text-(--accent)">
                  {link.label}
                </span>
                <span
                  className="shrink-0 text-(--text-faint) transition-colors group-hover:text-(--accent)"
                  aria-hidden
                >
                  →
                </span>
              </span>
              <p className="pr-6 text-sm leading-relaxed text-(--text-secondary)">
                {link.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ServiceDirectory() {
  return (
    <div className="flex flex-col gap-12 md:gap-14">
      {DIRECTORY_GROUPS.map((group) => (
        <DirectoryGroupSection key={group.id} group={group} />
      ))}
    </div>
  );
}
