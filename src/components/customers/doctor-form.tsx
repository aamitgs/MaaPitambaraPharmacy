"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { quickAddDoctor } from "@/lib/actions/pos";
import { Plus } from "lucide-react";

export function DoctorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");

  function submit() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await quickAddDoctor({
          name: name.trim(),
          registrationNo: registrationNo.trim() || undefined,
          clinicName: clinicName.trim() || undefined,
          phone: phone.trim() || undefined,
        });
        toast.success("Doctor added");
        setName("");
        setRegistrationNo("");
        setClinicName("");
        setPhone("");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Add doctor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add doctor</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doctor-name">Name</Label>
            <Input
              id="doctor-name"
              autoFocus
              // Receipts print this verbatim, so the title belongs in the value.
              placeholder="Dr. Deepak Kumar Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-reg">Registration no.</Label>
            <Input
              id="doctor-reg"
              placeholder="MCI-57000"
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-clinic">Clinic name</Label>
            <Input
              id="doctor-clinic"
              placeholder="Mudgal Gastro Medics"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-phone">Phone</Label>
            <Input
              id="doctor-phone"
              type="tel"
              inputMode="tel"
              placeholder="9828912257"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <Button disabled={pending || !name.trim()} onClick={submit}>
            Add doctor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
