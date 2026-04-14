// Server/Validators/Rulesets/usuarios.js

const emailRegex =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function isPositiveInt(v) { return Number.isInteger(Number(v)) && Number(v) > 0; }
function isBitLike(v) { return v===0 || v===1 || v===true || v===false || v===null || v===undefined; }

const nombreRule = {
  required: true,
  type: 'string',
  trim: true,
  minLength: 1,
  maxLength: 100,
  messages: {
    required: 'nombre es requerido',
    maxLength: 'nombre no puede exceder 100 caracteres'
  }
};

const emailRule = {
  required: true,
  type: 'string',
  trim: true,
  maxLength: 150,
  custom: v => (emailRegex.test(String(v)) ? true : 'email inválido')
};

// El SP usuarios_insert/update valida: tipo IN ('Usuario','Admin') (NULL/'' -> 'Usuario').
// Se aceptan sinónimos y el router los normaliza al enum canónico ('Usuario' | 'Admin').
const TIPO_ALLOWED = ['Usuario', 'Admin', 'usuario', 'admin', 'user', 'administrador'];
const tipoRule = {
  required: false,
  type: 'string',
  trim: true,
  maxLength: 15,
  custom: v => {
    if (v == null) return true;
    const s = String(v).trim();
    if (!s) return true; // vacío -> el SP aplica default
    return TIPO_ALLOWED.includes(s) ? true : "tipo inválido: use 'Usuario' o 'Admin'";
  }
};

const idRule = {
  required: true,
  custom: v => (isPositiveInt(v) ? true : 'usuario_id debe ser entero positivo')
};

module.exports = {
  InsertRules: {
    nombre: nombreRule,
    contrasena: {
      required: true,
      type: 'string',
      trim: true,
      minLength: 6,
      maxLength: 255,
      messages: {
        required: 'contrasena es requerida',
        minLength: 'contrasena debe tener al menos 6 caracteres',
        maxLength: 'contrasena no puede exceder 255 caracteres'
      }
    },
    email: emailRule,
    tipo: tipoRule
  },

  UpdateRules: {
    usuario_id: idRule,
    nombre: nombreRule,
    email: emailRule,
    tipo: tipoRule
  },

  DeleteRules: {
    usuario_id: idRule
  },

  PorIdRules: {
    usuario_id: idRule
  },

  PorEmailRules: {
    email: emailRule
  },

  LoginLookupRules: {
    email: emailRule
  },

  SetTipoRules: {
    usuario_id: idRule,
    tipo: {
      ...tipoRule,
      required: true,
      messages: {
        required: 'tipo es requerido'
      }
    }
  },

  SetAdminRules: {
    usuario_id: idRule
  }
};
