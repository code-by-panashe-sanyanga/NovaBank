import Link from "next/link";

// simple text logo with a coin-ish mark so it works at any size
// without needing an image file
export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-display text-xl font-bold">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-black text-white">
        N
      </span>
      <span>
        Nova<span className="text-brand-600 dark:text-brand-400">Bank</span>
      </span>
    </Link>
  );
}
