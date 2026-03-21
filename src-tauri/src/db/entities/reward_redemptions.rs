use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "reward_redemptions")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub uuid: String,
    pub student_name: String,
    pub reward_id: i32,
    pub reward_name: String,
    pub cost_points: i32,
    pub redeemed_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
