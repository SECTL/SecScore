use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "score_events")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub uuid: String,
    pub student_name: String,
    pub reason_content: String,
    pub delta: i32,
    pub val_prev: i32,
    pub val_curr: i32,
    pub event_time: String,
    pub settlement_id: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
