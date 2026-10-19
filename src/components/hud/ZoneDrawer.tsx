import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "#/components/ui/8bit/drawer";
import type { ZoneContent as ZoneContentData } from "#/data/cv";
import { ZoneContent } from "./ZoneContent";

export function ZoneDrawer({
	zone,
	onClose,
}: {
	zone: ZoneContentData | null;
	onClose(): void;
}) {
	return (
		<Drawer
			open={zone !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent className="max-h-[85vh]">
				{zone && (
					<>
						<DrawerHeader className="text-left">
							<DrawerTitle className="text-sm leading-relaxed">
								{zone.title}
							</DrawerTitle>
							<DrawerDescription className="font-sans text-xs">
								{zone.tagline}
							</DrawerDescription>
						</DrawerHeader>
						<div className="max-h-[70vh] overflow-y-auto px-4 pb-8">
							<ZoneContent zone={zone} />
						</div>
					</>
				)}
			</DrawerContent>
		</Drawer>
	);
}
