import StudentView from "@/components/StudentView";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <StudentView code={code.toUpperCase()} />;
}