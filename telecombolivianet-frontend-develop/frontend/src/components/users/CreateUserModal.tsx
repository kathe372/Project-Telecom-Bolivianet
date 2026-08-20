import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { userService } from '@/services/userService';
import type { CreateUserRequest } from '@/types/auth.types';
import { extractApiError } from '@/utils/apiError';
import { Modal } from './Modal';

const createSchema = z.object({
  FullName:          z.string().min(2, 'Obligatorio').max(150),
  Email:             z.string().email('Email inválido'),
  TemporaryPassword: z
    .string().min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe tener una mayúscula')
    .regex(/[a-z]/, 'Debe tener una minúscula')
    .regex(/[0-9]/, 'Debe tener un número'),
  Role:  z.enum(['Admin', 'Tecnico', 'SocioLectura']),
  Phone: z.string().max(20).nullable().optional(),
});

type CreateForm = z.infer<typeof createSchema>;

export function CreateUserModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const form = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  const handleCreate = async (data: CreateForm) => {
    setActionError('');
    setSaving(true);
    try {
      await userService.create(data as CreateUserRequest);
      form.reset();
      onCreated();
    } catch (err: unknown) {
      setActionError(extractApiError(err, 'Error al crear el usuario.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      {actionError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{actionError}
        </div>
      )}
      <form onSubmit={form.handleSubmit(handleCreate)} noValidate className="space-y-4">
        {[
          { id: 'FullName',          label: 'Nombre completo',    type: 'text',     placeholder: 'Juan Pérez López'             },
          { id: 'Email',             label: 'Correo electrónico', type: 'email',    placeholder: 'juan@telecombolivianet.bo'    },
          { id: 'TemporaryPassword', label: 'Contraseña temporal', type: 'password', placeholder: 'Mínimo 8 caracteres'          },
        ].map(({ id, label, type, placeholder }) => (
          <div key={id}>
            <label className="label">{label}</label>
            <input
              type={type}
              placeholder={placeholder}
              className={`input-field ${form.formState.errors[id as keyof CreateForm] ? 'input-error' : ''}`}
              {...form.register(id as keyof CreateForm)}
            />
            {form.formState.errors[id as keyof CreateForm] && (
              <p className="error-msg">
                {form.formState.errors[id as keyof CreateForm]?.message}
              </p>
            )}
          </div>
        ))}

        <div>
          <label className="label">Rol</label>
          <select
            className={`input-field ${form.formState.errors.Role ? 'input-error' : ''}`}
            {...form.register('Role')}
          >
            <option value="">Selecciona un rol</option>
            <option value="Admin">Administrador</option>
            <option value="Tecnico">Técnico</option>
            <option value="SocioLectura">Socio (solo lectura)</option>
          </select>
          {form.formState.errors.Role && (
            <p className="error-msg">{form.formState.errors.Role.message}</p>
          )}
        </div>

        <div>
          <label className="label">WhatsApp (notificaciones de tickets)</label>
          <input
            type="tel"
            placeholder="59170000000 — con código de país"
            className="input-field"
            {...form.register('Phone')}
          />
          <p className="text-xs text-gray-400 mt-1">
            Opcional. Requerido para técnicos que reciben avisos de asignación.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Crear usuario'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
