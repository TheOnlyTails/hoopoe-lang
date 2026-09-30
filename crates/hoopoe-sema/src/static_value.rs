use hoopoe_ast::ops::{BinaryOperator, PrefixOperator};
use num_bigint::BigInt;

#[derive(Clone)]
pub(super) enum StaticValue {
	Int(BigInt),
	UInt(BigInt),
	Float(f64),
	Char(char),
	Boolean(bool),
}

impl StaticValue {
	fn int(value: BigInt) -> Option<Self> {
		(value >= BigInt::from(i64::MIN) && value <= BigInt::from(i64::MAX)).then_some(Self::Int(value))
	}

	fn uint(value: BigInt) -> Option<Self> {
		(value >= BigInt::from(0_u8) && value <= BigInt::from(u64::MAX)).then_some(Self::UInt(value))
	}

	pub(super) fn boolean(self) -> Option<bool> {
		match self {
			Self::Boolean(value) => Some(value),
			_ => None,
		}
	}

	pub(super) fn prefix(op: PrefixOperator, value: Self) -> Option<Self> {
		match (op, value) {
			(PrefixOperator::BoolNot, Self::Boolean(value)) => Some(Self::Boolean(!value)),
			(PrefixOperator::Negate, Self::Int(value)) => Self::int(-value),
			(PrefixOperator::Negate, Self::Float(value)) => Some(Self::Float(-value)),
			(PrefixOperator::BitNot, Self::Int(value)) => Some(Self::Int(!value)),
			_ => None,
		}
	}

	pub(super) fn binary(op: BinaryOperator, lhs: Self, rhs: Self) -> Option<Self> {
		use BinaryOperator as Op;
		use StaticValue as Value;

		let boolean = |value| Some(Value::Boolean(value));
		match (op, lhs, rhs) {
			(Op::Plus, Value::Int(lhs), Value::Int(rhs)) => Value::int(lhs + rhs),
			(Op::Minus, Value::Int(lhs), Value::Int(rhs)) => Value::int(lhs - rhs),
			(Op::Times, Value::Int(lhs), Value::Int(rhs)) => Value::int(lhs * rhs),
			(Op::Divide, Value::Int(lhs), Value::Int(rhs)) if rhs != BigInt::from(0) => Some(
				Value::Float(i64::try_from(lhs).ok()? as f64 / i64::try_from(rhs).ok()? as f64),
			),
			(Op::Remainder, Value::Int(lhs), Value::Int(rhs)) if rhs != BigInt::from(0) => {
				Some(Value::Int(lhs % rhs))
			}
			(Op::BitAnd, Value::Int(lhs), Value::Int(rhs)) => Some(Value::Int(lhs & rhs)),
			(Op::BitOr, Value::Int(lhs), Value::Int(rhs)) => Some(Value::Int(lhs | rhs)),
			(Op::BitXor, Value::Int(lhs), Value::Int(rhs)) => Some(Value::Int(lhs ^ rhs)),
			(Op::LeftShift, Value::Int(lhs), Value::Int(rhs)) => {
				Value::int(lhs << u32::try_from(rhs).ok().filter(|count| *count < 64)?)
			}
			(Op::RightShift, Value::Int(lhs), Value::Int(rhs)) => {
				Value::int(lhs >> u32::try_from(rhs).ok().filter(|count| *count < 64)?)
			}
			(Op::Plus, Value::UInt(lhs), Value::UInt(rhs)) => Value::uint(lhs + rhs),
			(Op::Minus, Value::UInt(lhs), Value::UInt(rhs)) => Value::uint(lhs - rhs),
			(Op::Times, Value::UInt(lhs), Value::UInt(rhs)) => Value::uint(lhs * rhs),
			(Op::Divide, Value::UInt(lhs), Value::UInt(rhs)) if rhs != BigInt::from(0) => Some(
				Value::Float(u64::try_from(lhs).ok()? as f64 / u64::try_from(rhs).ok()? as f64),
			),
			(Op::Remainder, Value::UInt(lhs), Value::UInt(rhs)) if rhs != BigInt::from(0) => {
				Some(Value::UInt(lhs % rhs))
			}
			(Op::BitAnd, Value::UInt(lhs), Value::UInt(rhs)) => Some(Value::UInt(lhs & rhs)),
			(Op::BitOr, Value::UInt(lhs), Value::UInt(rhs)) => Some(Value::UInt(lhs | rhs)),
			(Op::BitXor, Value::UInt(lhs), Value::UInt(rhs)) => Some(Value::UInt(lhs ^ rhs)),
			(Op::LeftShift, Value::UInt(lhs), Value::UInt(rhs)) => {
				Value::uint(lhs << u32::try_from(rhs).ok().filter(|count| *count < 64)?)
			}
			(Op::RightShift, Value::UInt(lhs), Value::UInt(rhs)) => {
				Value::uint(lhs >> u32::try_from(rhs).ok().filter(|count| *count < 64)?)
			}
			(Op::Plus, Value::Float(lhs), Value::Float(rhs)) => Some(Value::Float(lhs + rhs)),
			(Op::Minus, Value::Float(lhs), Value::Float(rhs)) => Some(Value::Float(lhs - rhs)),
			(Op::Times, Value::Float(lhs), Value::Float(rhs)) => Some(Value::Float(lhs * rhs)),
			(Op::Divide, Value::Float(lhs), Value::Float(rhs)) => Some(Value::Float(lhs / rhs)),
			(Op::Remainder, Value::Float(lhs), Value::Float(rhs)) => Some(Value::Float(lhs % rhs)),
			(Op::BoolAnd, Value::Boolean(lhs), Value::Boolean(rhs)) => boolean(lhs && rhs),
			(Op::BoolOr, Value::Boolean(lhs), Value::Boolean(rhs)) => boolean(lhs || rhs),
			(Op::Equals, lhs, rhs) => lhs.equals(&rhs).map(Value::Boolean),
			(Op::NotEquals, lhs, rhs) => lhs.equals(&rhs).map(|value| Value::Boolean(!value)),
			(Op::LessThan, lhs, rhs) => lhs
				.compare(&rhs)
				.map(|ordering| Value::Boolean(ordering.is_lt())),
			(Op::LessThanEquals, lhs, rhs) => lhs
				.compare(&rhs)
				.map(|ordering| Value::Boolean(!ordering.is_gt())),
			(Op::GreaterThan, lhs, rhs) => lhs
				.compare(&rhs)
				.map(|ordering| Value::Boolean(ordering.is_gt())),
			(Op::GreaterThanEquals, lhs, rhs) => lhs
				.compare(&rhs)
				.map(|ordering| Value::Boolean(!ordering.is_lt())),
			_ => None,
		}
	}

	fn equals(&self, other: &Self) -> Option<bool> {
		Some(match (self, other) {
			(Self::Int(lhs), Self::Int(rhs))
			| (Self::UInt(lhs), Self::UInt(rhs))
			| (Self::Int(lhs), Self::UInt(rhs))
			| (Self::UInt(lhs), Self::Int(rhs)) => lhs == rhs,
			(Self::Float(lhs), Self::Float(rhs)) => lhs == rhs,
			(Self::Char(lhs), Self::Char(rhs)) => lhs == rhs,
			(Self::Boolean(lhs), Self::Boolean(rhs)) => lhs == rhs,
			_ => return None,
		})
	}

	fn compare(&self, other: &Self) -> Option<std::cmp::Ordering> {
		match (self, other) {
			(Self::Int(lhs), Self::Int(rhs))
			| (Self::UInt(lhs), Self::UInt(rhs))
			| (Self::Int(lhs), Self::UInt(rhs))
			| (Self::UInt(lhs), Self::Int(rhs)) => Some(lhs.cmp(rhs)),
			(Self::Float(lhs), Self::Float(rhs)) => lhs.partial_cmp(rhs),
			(Self::Char(lhs), Self::Char(rhs)) => Some(lhs.cmp(rhs)),
			_ => None,
		}
	}
}
