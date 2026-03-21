use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "students")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub name: String,
    pub score: i32,
    pub reward_points: i32,
    pub tags: String,
    pub extra_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::student_tags::Entity")]
    StudentTags,
}

impl Related<super::student_tags::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::StudentTags.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
