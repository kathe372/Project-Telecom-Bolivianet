import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { userService } from '@/services/userService';
import type { UserSystemDto, UpdateUserRequest } from '@/types/auth.types';
import { extractApiError } from '@/utils/apiError';
import { Modal } from './Modal';

const editSchema = z.object({
  FullName: z.string().min(2, 'Obligatorio').max(150),
  Email:    z.string().email('Email inválido'),
  Role:     z.enum(['Admin', 'Tecnico', 'SocioLectura']),
  Phone:    z.string().max(20).nullable().optional(),
});

type EditForm = z.infer<typeof editSchema>;

export function EditUserModal({
  user, onClose, onSaved,
}: {
  user: UserSystemDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { FullName: user.FullName, Email: user.Email, Role: user.Role, Phone: user.Phone },
  });

  const handleEdit = async (data: EditForm) => {
    setActionError('');
    setSaving(true);
    try {
      await userService.update(user.Id, data as UpdateUserRequest);
      onSaved();
    } catch (err: unknown) {
      setActionError(extractApiError(err, 'Error al actualizar el usuario.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Editar usuario" onClose={onClose}>
      {actionError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{actionError}
        </div>
      )}
      <form onSubmit={form.handleSubmit(handleEdit)} noValidate className="space-y-4">
        {[
          { id: 'FullName', label: 'Nombre completo',    type: 'text'  },
          { id: 'Email',    label: 'Correo electrónico', type: 'email' },
        ].map(({ id, label, type }) => (
          <div key={id}>
            <label className="label">{label}</label>
            <input
              type={type}
              className={`input-field ${form.formState.errors[id as keyof EditForm] ? 'input-error' : ''}`}
              {...form.register(id as keyof EditForm)}
            />
            {form.formState.errors[id as keyof EditForm] && (
              <p className="error-msg">
                {form.formState.errors[id as keyof EditForm]?.message}
              </p>
            )}
          </div>
        ))}

        <div>
          <label className="label">WhatsApp (notificaciones de tickets)</label>
          <input
            type="tel"
            placeholder="59170000000 — con código de país"
            className="input-field"
            {...form.register('Phone')}
          />
          <p className="text-xs text-gray-400 mt-1">
            Requerido para técnicos. El sistema envía avisos de asignación a este número.
          </p>
        </div>

        <div>
          <label className="label">Rol</label>
          <select
            className={`input-field ${form.formState.errors.Role ? 'input-error' : ''}`}
            {...form.register('Role')}
          >
            <option value="Admin">Administrador</option>
            <option value="Tecnico">Técnico</option>
            <option value="SocioLectura">Socio (solo lectura)</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
