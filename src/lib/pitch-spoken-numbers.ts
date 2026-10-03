const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const scales: [number, string][] = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];

function integerWords(number: number): string {
  if (number < 20) return small[number];
  if (number < 100) return tens[Math.floor(number / 10)] + (number % 10 ? " " + small[number % 10] : "");
  if (number < 1000) return small[Math.floor(number / 100)] + " hundred" + (number % 100 ? " and " + integerWords(number % 100) : "");
  for (const [scale, name] of scales) {
    if (number >= scale) {
      const remainder = number % scale;
      return integerWords(Math.floor(number / scale)) + " " + name +
        (remainder ? (remainder < 100 ? " and " : " ") + integerWords(remainder) : "");
    }
  }
  return "";
}

// Expand the speech input, rather than asking a voice model to interpret digits.
export function expandPitchSpokenNumbers(text: string): string {
  const protectedRanges = [...text.matchAll(/\b(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi)]
    .map(match => [match.index!, match.index! + match[0].length]);
  return text.replace(
    /(?<![\w.])([£$€]?)(-?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:([kmb])|\s+(thousand|million|billion))?(%)?(?!\w|\.\d)/gi,
    (original, currency: string, negative: string, whole: string, fraction: string | undefined,
      abbreviation: string | undefined, scaleName: string | undefined, percent: string | undefined, offset: number) => {
      if (protectedRanges.some(([start, end]) => offset >= start && offset < end)) return original;
      const digits = whole.replace(/,/g, "");
      if (digits.length > 1 && digits.startsWith("0")) return original;
      const scale = (abbreviation || scaleName || "").toLowerCase();
      const multiplier = ({ k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 } as Record<string, number>)[scale];
      const value = Number(digits + (fraction ? "." + fraction : ""));
      const expanded = multiplier ? value * multiplier : value;
      if (!Number.isFinite(expanded) || expanded > Number.MAX_SAFE_INTEGER) return original;
      let spoken = integerWords(Number(digits));
      if (multiplier && Number.isSafeInteger(expanded)) spoken = integerWords(expanded);
      else {
        if (fraction) spoken += " point " + [...fraction].map(digit => small[Number(digit)]).join(" ");
        if (scale) spoken += " " + (({ k: "thousand", m: "million", b: "billion" } as Record<string, string>)[scale] || scale);
      }
      if (currency) {
        const unit = currency === "£" ? "pound" : currency === "$" ? "dollar" : "euro";
        if (!multiplier && fraction && fraction.length <= 2) {
          const minor = Number(fraction.padEnd(2, "0"));
          const major = Number(digits);
          const minorUnit = currency === "£" ? (minor === 1 ? "penny" : "pence") : (minor === 1 ? "cent" : "cents");
          spoken = major || !minor ? integerWords(major) + " " + unit + (major === 1 ? "" : "s") : "";
          if (minor) spoken += (spoken ? " and " : "") + integerWords(minor) + " " + minorUnit;
        } else spoken += " " + unit + (expanded === 1 ? "" : "s");
      }
      return (negative ? "minus " : "") + spoken + (percent ? " per cent" : "");
    }
  );
}
