"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { quickAddDoctor } from "@/lib/actions/pos";
import type { PosDoctor } from "./types";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function PrescriptionFields({
  doctors,
  doctorId,
  onDoctorChange,
  patientName,
  onPatientNameChange,
  patientAge,
  onPatientAgeChange,
  patientPhone,
  onPatientPhoneChange,
  patientAddress,
  onPatientAddressChange,
  onDoctorCreated,
  required,
}: {
  doctors: PosDoctor[];
  doctorId: string | null;
  onDoctorChange: (id: string) => void;
  patientName: string;
  onPatientNameChange: (v: string) => void;
  patientAge: string;
  onPatientAgeChange: (v: string) => void;
  patientPhone: string;
  onPatientPhoneChange: (v: string) => void;
  patientAddress: string;
  onPatientAddressChange: (v: string) => void;
  onDoctorCreated: (doctor: PosDoctor) => void;
  /** Schedule H/H1/X items make doctor + patient name mandatory to check
   *  out; otherwise the fields are shown but optional. */
  required: boolean;
}) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newDoctorName, setNewDoctorName] = useState("");
  const [newDoctorReg, setNewDoctorReg] = useState("");
  const [newDoctorPhone, setNewDoctorPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function submitQuickAdd() {
    if (!newDoctorName.trim()) return;
    startTransition(async () => {
      try {
        const doctor = await quickAddDoctor({
          name: newDoctorName.trim(),
          registrationNo: newDoctorReg.trim() || undefined,
          phone: newDoctorPhone.trim() || undefined,
        });
        onDoctorCreated(doctor);
        onDoctorChange(doctor.id);
        setQuickAddOpen(false);
        setNewDoctorName("");
        setNewDoctorReg("");
        setNewDoctorPhone("");
        toast.success("Doctor added");
      } catch {
        toast.error("Could not add doctor");
      }
    });
  }

  return (
    <div
      className={
        required
          ? "rounded-lg border border-warning/40 bg-warning/10 p-3"
          : "rounded-lg border p-3"
      }
    >
      <p
        className={
          required
            ? "mb-2 text-xs font-medium text-warning-foreground"
            : "mb-2 text-xs font-medium text-muted-foreground"
        }
      >
        {required
          ? "Prescription required — this cart contains a Schedule H/H1/X item."
          : "Doctor & patient details (optional)"}
      </p>
      {/* One row, 12 columns: address takes the most, age the least — it's
          two digits, so it sits last rather than pushing the wider fields
          around. */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 space-y-1">
          <Label className="text-xs">Doctor{required ? " *" : ""}</Label>
          <div className="flex gap-1">
            <Select value={doctorId ?? undefined} onValueChange={onDoctorChange}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select doctor" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setQuickAddOpen(true)}
              aria-label="Add new doctor"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Patient name{required ? " *" : ""}</Label>
          <Input
            className="h-8"
            value={patientName}
            onChange={(e) => onPatientNameChange(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Patient phone</Label>
          <Input
            className="h-8"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={patientPhone}
            onChange={(e) => onPatientPhoneChange(e.target.value)}
          />
        </div>
        <div className="col-span-4 space-y-1">
          <Label className="text-xs">Patient address</Label>
          <Input
            className="h-8"
            autoComplete="off"
            value={patientAddress}
            onChange={(e) => onPatientAddressChange(e.target.value)}
          />
        </div>
        <div className="col-span-1 space-y-1">
          <Label className="text-xs">Age</Label>
          <Input
            className="h-8"
            type="number"
            value={patientAge}
            onChange={(e) => onPatientAgeChange(e.target.value)}
          />
        </div>
      </div>

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add doctor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                value={newDoctorName}
                onChange={(e) => setNewDoctorName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuickAdd()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Registration no.</Label>
              <Input
                value={newDoctorReg}
                onChange={(e) => setNewDoctorReg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuickAdd()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                type="tel"
                inputMode="tel"
                value={newDoctorPhone}
                onChange={(e) => setNewDoctorPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuickAdd()}
              />
            </div>
            <Button disabled={pending || !newDoctorName.trim()} onClick={submitQuickAdd}>
              Add doctor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
