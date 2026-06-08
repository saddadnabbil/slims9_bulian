<?php
/**
 * Create the per-member ebook bookmark table.
 *
 * Each row is one bookmark a member placed inside an ebook, identified by
 * its location (EPUB CFI or PDF page number) with an optional chapter label
 * and a short excerpt for display.
 */

use SLiMS\Table\Schema;
use SLiMS\Table\Blueprint;

class CreateEbookBookmarkTable extends \SLiMS\Migration\Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    function up()
    {
        Schema::create('ebook_bookmark', function (Blueprint $table) {
            $table->engine = 'MyISAM';
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
            $table->autoIncrement('id');
            $table->number('member_id', 11)->notNull();
            $table->number('biblio_id', 11)->notNull();
            $table->number('file_id', 11)->notNull();
            $table->text('location')->notNull();
            $table->string('label', 255)->nullable();
            $table->text('excerpt');
            $table->datetime('created_at')->notNull();
            $table->index('member_id');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    function down()
    {
        Schema::drop('ebook_bookmark');
    }
}
