import Image from "next/image";
import Link from "next/link";

/** The Gluton-Free logo mark with the wordmark, linking home. The mark is decorative: the wordmark names the link. */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link className={`brand ${className}`} href="/">
      <Image src="/brand-mark.png" alt="" width={32} height={32} priority />
      <span>Gluton-Free</span>
    </Link>
  );
}
