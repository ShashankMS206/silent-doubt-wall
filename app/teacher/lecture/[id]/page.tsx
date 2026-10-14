import LectureBoard from "@/components/LectureBoard";

export default async function LecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LectureBoard lectureId={id} />;
}