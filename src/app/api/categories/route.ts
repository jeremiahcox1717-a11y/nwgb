import { CATEGORIES } from "@/lib/categories";

export async function GET() {
  return Response.json({
    categories: [
      { id: "quick", label: "All kinds (quick scan)" },
      ...CATEGORIES.map((item) => ({ id: item.id, label: item.label })),
    ],
  });
}
